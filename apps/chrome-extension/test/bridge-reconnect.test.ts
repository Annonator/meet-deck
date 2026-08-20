import {
  PROTOCOL_VERSION,
  encodeAuthProofInput,
  encodeProtectedMessageMacInput,
  encodeSessionKeyInfo,
  encodeSessionKeySalt,
  safeParseProtocolMessage,
  serializeProtocolMessage,
  type AuthBinding,
  type AuthHelloMessage,
  type ProtectedMacInput,
  type ProtocolMessage,
  type ResultMessage
} from "@meet-deck/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BridgeClient } from "../src/bridge/bridge-client";
import {
  deriveSessionHmacKey,
  encodeBase64Url,
  hmacSha256Bytes,
  signWithKey
} from "../src/bridge/crypto";

const EXTENSION_ID = "a".repeat(32);
const ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const STORAGE_KEY = "meetDeck.bridge.v1";

class FakeWebSocket extends EventTarget {
  static readonly CLOSED = 3;
  static readonly CLOSING = 2;
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly instances: FakeWebSocket[] = [];

  binaryType: BinaryType = "blob";
  protocol = "";
  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];

  constructor(
    readonly url: string,
    readonly requestedProtocol: string
  ) {
    super();
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.protocol = this.requestedProtocol;
    this.dispatchEvent(new Event("open"));
  }

  send(data: string): void {
    this.sent.push(data);
  }

  serverMessage(message: ProtocolMessage): void {
    this.dispatchEvent(new MessageEvent("message", { data: serializeProtocolMessage(message) }));
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  }
}

describe("BridgeClient reconnect invariants", () => {
  const storage = new Map<string, unknown>();
  const permissionContains = vi.fn(async () => true);
  let originalChrome: typeof chrome | undefined;
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    storage.clear();
    permissionContains.mockReset().mockResolvedValue(true);
    FakeWebSocket.instances.length = 0;
    originalChrome = globalThis.chrome;
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.chrome = {
      permissions: {
        contains: permissionContains
      },
      runtime: { id: EXTENSION_ID },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            for (const [key, value] of Object.entries(items)) {
              storage.set(key, value);
            }
          }),
          setAccessLevel: vi.fn(async () => undefined)
        }
      }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = originalWebSocket;
    if (originalChrome === undefined) {
      Reflect.deleteProperty(globalThis, "chrome");
    } else {
      globalThis.chrome = originalChrome;
    }
  });

  it("reconnects after the heartbeat deadline and publishes the unavailable status", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const token = tokenFor(13);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const statuses: ReturnType<BridgeClient["status"]>[] = [];
    const bridge = createBridge({
      onStatusChange: () => statuses.push(bridge.status("none"))
    });

    await bridge.start();
    await authenticateStoredTokenSocket(bridge, FakeWebSocket.instances[0], token, 21);

    await vi.advanceTimersByTimeAsync(80_000);
    expect(bridge.status("none")).toMatchObject({
      authentication: "pairing",
      connection: "disconnected",
      problem: "bridge_unavailable"
    });
    expect(statuses).toContainEqual(
      expect.objectContaining({
        authentication: "pairing",
        connection: "disconnected",
        problem: "bridge_unavailable"
      })
    );
    expect(FakeWebSocket.instances).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    await bridge.forgetPairing();
  });

  it("does not retry when Chrome blocks loopback access", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    globalThis.WebSocket = class {
      constructor() {
        attempts += 1;
        throw new DOMException("denied", "SecurityError");
      }
    } as unknown as typeof WebSocket;
    const onStatusChange = vi.fn();
    const bridge = createBridge({ onStatusChange });

    await bridge.start();
    await expect(bridge.pair("23456789ABCDEFGHJKLMNPQRS")).resolves.toBe(false);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      problem: "loopback_permission_denied"
    });
    expect(attempts).toBe(1);

    bridge.retryConnection();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toBe(1);
    expect(onStatusChange).toHaveBeenCalled();
  });

  it("does not open a background socket when the optional host grant is missing", async () => {
    const token = tokenFor(12);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    permissionContains.mockResolvedValueOnce(false);
    const bridge = createBridge();

    await bridge.start();

    expect(permissionContains).toHaveBeenCalledWith({
      origins: ["ws://127.0.0.1:53421/*"]
    });
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: true,
      problem: "loopback_permission_required"
    });

    bridge.retryConnection();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("resumes an existing pairing only after a foreground permission grant", async () => {
    const token = tokenFor(14);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    globalThis.WebSocket = class {
      constructor() {
        throw new DOMException("denied", "SecurityError");
      }
    } as unknown as typeof WebSocket;
    const bridge = createBridge();

    await bridge.start();
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: true,
      problem: "loopback_permission_denied"
    });

    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    expect(bridge.resumeAfterPermissionGrant()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe("ws://127.0.0.1:53421/v1");
    const resumedStatus = bridge.status("none");
    expect(resumedStatus).toMatchObject({
      authentication: "pairing",
      connection: "connecting",
      paired: true
    });
    expect(resumedStatus.problem).toBeUndefined();

    await bridge.forgetPairing();
  });

  it("ignores a stale passive denial after foreground permission recovery", async () => {
    const token = tokenFor(16);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    FakeWebSocket.instances[0]?.close();
    const delayedPermission = deferred<boolean>();
    permissionContains.mockImplementationOnce(() => delayedPermission.promise);

    bridge.retryConnection();
    await vi.waitFor(() => expect(permissionContains).toHaveBeenCalledTimes(2));
    expect(bridge.resumeAfterPermissionGrant()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(2);

    delayedPermission.resolve(false);
    await flushMicrotasks();

    const status = bridge.status("none");
    expect(status).toMatchObject({
      authentication: "pairing",
      connection: "connecting",
      paired: true
    });
    expect(status.problem).toBeUndefined();

    await bridge.forgetPairing();
  });

  it("disconnects an active socket when its exact loopback grant is removed", async () => {
    const token = tokenFor(18);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    const socket = FakeWebSocket.instances[0];

    bridge.handleLoopbackPermissionRemoval(["ws://127.0.0.1:53421/*"]);

    expect(socket?.readyState).toBe(FakeWebSocket.CLOSED);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: true,
      problem: "loopback_permission_required"
    });
  });

  it("stabilizes a disconnected pairing when its current grant is removed", async () => {
    const token = tokenFor(20);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    FakeWebSocket.instances[0]?.close();

    bridge.handleLoopbackPermissionRemoval(["ws://127.0.0.1:53421/*"]);

    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: true,
      problem: "loopback_permission_required"
    });
    bridge.retryConnection();
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("drops an auth challenge whose HMAC finishes after the socket was replaced", async () => {
    const token = tokenFor(15);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.open();
    const firstBinding = bindingFor(requireHello(firstSocket, 0), 31);
    const delayedSignature = deferred<ArrayBuffer>();
    const signSpy = vi
      .spyOn(crypto.subtle, "sign")
      .mockImplementationOnce(() => delayedSignature.promise);

    firstSocket?.serverMessage({ v: PROTOCOL_VERSION, type: "auth.challenge", ...firstBinding });
    await vi.waitFor(() => expect(signSpy).toHaveBeenCalledOnce());
    firstSocket?.close();
    bridge.retryConnection();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket?.open();
    expect(parseSent(secondSocket, 0)).toMatchObject({ type: "auth.hello" });

    delayedSignature.resolve(new Uint8Array(32).fill(1).buffer);
    await flushMicrotasks();
    expect(firstSocket?.sent).toHaveLength(1);
    expect(secondSocket?.sent).toHaveLength(1);
    expect(bridge.status("none").authentication).toBe("pairing");

    await bridge.forgetPairing();
  });

  it("drops an auth result whose verification finishes after the socket was replaced", async () => {
    const token = tokenFor(17);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.open();
    const firstBinding = bindingFor(requireHello(firstSocket, 0), 41);
    firstSocket?.serverMessage({ v: PROTOCOL_VERSION, type: "auth.challenge", ...firstBinding });
    await vi.waitFor(() => expect(firstSocket?.sent).toHaveLength(2));
    const serverHmac = await hmacSha256Bytes(token, encodeAuthProofInput(firstBinding, "plugin"));
    const delayedVerification = deferred<boolean>();
    const verifySpy = vi
      .spyOn(crypto.subtle, "verify")
      .mockImplementationOnce(() => delayedVerification.promise);

    firstSocket?.serverMessage({
      v: PROTOCOL_VERSION,
      type: "auth.result",
      session: firstBinding.session,
      status: "ok",
      serverHmac
    });
    await vi.waitFor(() => expect(verifySpy).toHaveBeenCalledOnce());
    firstSocket?.close();
    bridge.retryConnection();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket?.open();

    delayedVerification.resolve(true);
    await flushMicrotasks();
    expect(firstSocket?.sent).toHaveLength(2);
    expect(secondSocket?.sent).toHaveLength(1);
    expect(parseSent(secondSocket, 0)).toMatchObject({ type: "auth.hello" });
    expect(bridge.status("none").authentication).toBe("pairing");

    await bridge.forgetPairing();
  });

  it("does not deliver an old command result into a replacement session", async () => {
    const token = tokenFor(19);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const commandResult = deferred<ResultMessage>();
    const onCommand = vi.fn(() => commandResult.promise);
    const bridge = createBridge({ onCommand });
    await bridge.start();
    const firstSocket = FakeWebSocket.instances[0];
    const firstBinding = await authenticateStoredTokenSocket(bridge, firstSocket, token, 51);
    const inboundKey = await deriveSessionHmacKey(
      token,
      encodeSessionKeySalt(firstBinding),
      encodeSessionKeyInfo(firstBinding, "plugin_to_extension")
    );
    const commandInput: ProtectedMacInput = {
      v: PROTOCOL_VERSION,
      type: "protected",
      session: firstBinding.session,
      direction: "plugin_to_extension",
      seq: 1,
      message: {
        v: PROTOCOL_VERSION,
        type: "command",
        id: "stale-command",
        action: "microphone.set",
        value: false
      }
    };
    firstSocket?.serverMessage({
      ...commandInput,
      mac: await signWithKey(inboundKey, encodeProtectedMessageMacInput(commandInput))
    });
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledOnce());

    firstSocket?.close();
    bridge.retryConnection();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const secondSocket = FakeWebSocket.instances[1];
    await authenticateStoredTokenSocket(bridge, secondSocket, token, 61);
    const messagesBeforeOldResult = secondSocket?.sent.length ?? 0;

    commandResult.resolve({
      v: PROTOCOL_VERSION,
      type: "result",
      id: "stale-command",
      status: "ok"
    });
    await flushMicrotasks();
    expect(secondSocket?.sent).toHaveLength(messagesBeforeOldResult);
    expect(
      secondSocket?.sent.some((_, index) => {
        const message = parseSent(secondSocket, index);
        return (
          message?.type === "protected" &&
          message.message.type === "result" &&
          message.message.id === "stale-command"
        );
      })
    ).toBe(false);

    await bridge.forgetPairing();
  });

  it("does not close a replacement session when an old outbound signature rejects", async () => {
    const token = tokenFor(22);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    const firstSocket = FakeWebSocket.instances[0];
    const firstBinding = await authenticateStoredTokenSocket(bridge, firstSocket, token, 65);
    const inboundKey = await deriveSessionHmacKey(
      token,
      encodeSessionKeySalt(firstBinding),
      encodeSessionKeyInfo(firstBinding, "plugin_to_extension")
    );
    const pingInput: ProtectedMacInput = {
      v: PROTOCOL_VERSION,
      type: "protected",
      session: firstBinding.session,
      direction: "plugin_to_extension",
      seq: 1,
      message: { v: PROTOCOL_VERSION, type: "ping", nonce: tokenFor(67) }
    };
    const pingFrame = {
      ...pingInput,
      mac: await signWithKey(inboundKey, encodeProtectedMessageMacInput(pingInput))
    };
    let rejectOldSignature!: (reason?: unknown) => void;
    const oldSignature = new Promise<ArrayBuffer>((_resolve, reject) => {
      rejectOldSignature = reject;
    });
    const signSpy = vi.spyOn(crypto.subtle, "sign").mockImplementationOnce(() => oldSignature);

    firstSocket?.serverMessage(pingFrame);
    await vi.waitFor(() => expect(signSpy).toHaveBeenCalledOnce());
    firstSocket?.close();
    bridge.retryConnection();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const replacementSocket = FakeWebSocket.instances[1];
    await authenticateStoredTokenSocket(bridge, replacementSocket, token, 75);

    rejectOldSignature(new Error("old session crypto failed"));
    await flushMicrotasks();
    expect(bridge.status("none")).toMatchObject({
      authentication: "authenticated",
      connection: "connected"
    });
    expect(replacementSocket?.readyState).toBe(FakeWebSocket.OPEN);

    await bridge.forgetPairing();
  });

  it("resets exponential reconnect backoff only after successful authentication", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const token = tokenFor(23);
    storage.set(STORAGE_KEY, { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();

    const firstSocket = FakeWebSocket.instances[0];
    firstSocket?.open();
    firstSocket?.close();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const secondSocket = FakeWebSocket.instances[1];
    secondSocket?.open();
    secondSocket?.close();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(3);

    const authenticatedSocket = FakeWebSocket.instances[2];
    await authenticateStoredTokenSocket(bridge, authenticatedSocket, token, 71);
    authenticatedSocket?.close();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(4);

    await bridge.forgetPairing();
  });
});

function createBridge(
  overrides: Partial<ConstructorParameters<typeof BridgeClient>[0]> = {}
): BridgeClient {
  return new BridgeClient({
    getMeetingState: () => ({
      v: PROTOCOL_VERSION,
      type: "state",
      meetingMultiplicity: "none",
      camera: "unknown",
      hand: "unknown",
      microphone: "unknown",
      selfPresentation: "unknown"
    }),
    onCommand: vi.fn(),
    onStatusChange: vi.fn(),
    ...overrides
  });
}

async function authenticateStoredTokenSocket(
  bridge: BridgeClient,
  socket: FakeWebSocket | undefined,
  token: string,
  seed: number
): Promise<AuthBinding> {
  socket?.open();
  const binding = bindingFor(requireHello(socket, 0), seed);
  socket?.serverMessage({ v: PROTOCOL_VERSION, type: "auth.challenge", ...binding });
  await vi.waitFor(() => expect(socket?.sent).toHaveLength(2));
  socket?.serverMessage({
    v: PROTOCOL_VERSION,
    type: "auth.result",
    session: binding.session,
    status: "ok",
    serverHmac: await hmacSha256Bytes(token, encodeAuthProofInput(binding, "plugin"))
  });
  await vi.waitFor(() => expect(bridge.status("none").authentication).toBe("authenticated"));
  await vi.waitFor(() => expect(socket?.sent).toHaveLength(3));
  return binding;
}

function requireHello(socket: FakeWebSocket | undefined, index: number): AuthHelloMessage {
  const hello = parseSent(socket, index);
  if (hello?.type !== "auth.hello") {
    throw new Error("Expected auth hello");
  }
  return hello;
}

function bindingFor(hello: AuthHelloMessage, seed: number): AuthBinding {
  return {
    session: tokenFor(seed),
    clientNonce: hello.clientNonce,
    serverNonce: tokenFor(seed + 1),
    origin: ORIGIN,
    clientRole: "extension",
    serverRole: "plugin"
  };
}

function tokenFor(seed: number): string {
  return encodeBase64Url(new Uint8Array(32).fill(seed));
}

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  for (let iteration = 0; iteration < 10; iteration += 1) {
    await Promise.resolve();
  }
}

function parseSent(socket: FakeWebSocket | undefined, index: number) {
  const raw = socket?.sent[index];
  if (raw === undefined) {
    return undefined;
  }
  const parsed = safeParseProtocolMessage(raw);
  return parsed.success ? parsed.data : undefined;
}
