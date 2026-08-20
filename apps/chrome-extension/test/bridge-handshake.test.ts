import {
  PROTOCOL_VERSION,
  encodeAuthProofInput,
  encodePairingProofInput,
  encodeProtectedMessageMacInput,
  encodeSessionKeyInfo,
  encodeSessionKeySalt,
  safeParseProtocolMessage,
  serializeProtocolMessage,
  type AuthBinding,
  type PairingBinding,
  type ProtectedMacInput,
  type ProtocolMessage
} from "@meet-deck/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BridgeClient } from "../src/bridge/bridge-client";
import {
  deriveSessionHmacKey,
  encodeBase64Url,
  hmacSha256Bytes,
  hmacSha256TextKey,
  signWithKey,
  verifyWithKey
} from "../src/bridge/crypto";

const EXTENSION_ID = "a".repeat(32);
const ORIGIN = `chrome-extension://${EXTENSION_ID}`;
const PAIRING_KEY = "23456789ABCDEFGHJKLMNPQRS";

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

describe("BridgeClient authenticated transport", () => {
  const storage = new Map<string, unknown>();
  let originalChrome: typeof chrome | undefined;
  let originalWebSocket: typeof WebSocket;
  let storageSet: ReturnType<typeof vi.fn<(items: Record<string, unknown>) => Promise<void>>>;

  beforeEach(() => {
    storage.clear();
    FakeWebSocket.instances.length = 0;
    originalChrome = globalThis.chrome;
    originalWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    storageSet = vi.fn<(items: Record<string, unknown>) => Promise<void>>(async (items) => {
      for (const [key, value] of Object.entries(items)) {
        storage.set(key, value);
      }
    });
    globalThis.chrome = {
      permissions: {
        contains: vi.fn(async () => true)
      },
      runtime: { id: EXTENSION_ID },
      storage: {
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage.get(key) })),
          set: storageSet,
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

  it("connects only after a popup-driven pair and authenticates both peers", async () => {
    const onCommand = vi.fn(async (command: { readonly id: string }) => ({
      v: PROTOCOL_VERSION,
      type: "result" as const,
      id: command.id,
      status: "ok" as const
    }));
    const bridge = new BridgeClient({
      getMeetingState: () => ({
        v: PROTOCOL_VERSION,
        type: "state",
        meetingMultiplicity: "none",
        camera: "unknown",
        hand: "unknown",
        microphone: "unknown",
        selfPresentation: "unknown"
      }),
      onCommand,
      onStatusChange: vi.fn()
    });

    await bridge.start();
    expect(FakeWebSocket.instances).toHaveLength(0);

    const pairing = bridge.pair(PAIRING_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0];
    expect(socket?.url).toBe("ws://127.0.0.1:53421/v1");
    socket?.open();
    const pairHello = parseSent(socket, 0);
    expect(pairHello).toMatchObject({ type: "pair.hello", origin: ORIGIN, role: "extension" });
    if (pairHello?.type !== "pair.hello") {
      throw new Error("Expected pair hello");
    }

    const pairingBinding: PairingBinding = {
      clientNonce: pairHello.clientNonce,
      serverNonce: encodeBase64Url(new Uint8Array(32).fill(6)),
      origin: ORIGIN,
      clientRole: "extension",
      serverRole: "plugin"
    };
    socket?.serverMessage({
      v: 1,
      type: "pair.challenge",
      ...pairingBinding,
      serverHmac: await hmacSha256TextKey(
        PAIRING_KEY,
        encodePairingProofInput(pairingBinding, "plugin")
      )
    });
    await vi.waitFor(() => expect(socket?.sent).toHaveLength(2));
    const pairResponse = parseSent(socket, 1);
    expect(pairResponse).toMatchObject({ type: "pair.response", ...pairingBinding });
    if (pairResponse?.type !== "pair.response") {
      throw new Error("Expected pair response");
    }
    expect(pairResponse.clientHmac).toBe(
      await hmacSha256TextKey(PAIRING_KEY, encodePairingProofInput(pairingBinding, "extension"))
    );

    const token = encodeBase64Url(new Uint8Array(32).fill(7));
    socket?.serverMessage({ v: 1, type: "pair.granted", token });
    await vi.waitFor(() => expect(socket?.sent).toHaveLength(3));
    const hello = parseSent(socket, 2);
    expect(hello).toMatchObject({ type: "auth.hello", origin: ORIGIN, role: "extension" });
    if (hello?.type !== "auth.hello") {
      throw new Error("Expected auth hello");
    }

    const binding: AuthBinding = {
      session: encodeBase64Url(new Uint8Array(32).fill(9)),
      clientNonce: hello.clientNonce,
      serverNonce: encodeBase64Url(new Uint8Array(32).fill(11)),
      origin: ORIGIN,
      clientRole: "extension",
      serverRole: "plugin"
    };
    socket?.serverMessage({ v: 1, type: "auth.challenge", ...binding });
    await vi.waitFor(() => expect(socket?.sent).toHaveLength(4));
    const response = parseSent(socket, 3);
    expect(response).toMatchObject({ type: "auth.response", ...binding });
    if (response?.type !== "auth.response") {
      throw new Error("Expected auth response");
    }
    expect(response.hmac).toBe(
      await hmacSha256Bytes(token, encodeAuthProofInput(binding, "extension"))
    );

    const serverHmac = await hmacSha256Bytes(token, encodeAuthProofInput(binding, "plugin"));
    socket?.serverMessage({
      v: 1,
      type: "auth.result",
      session: binding.session,
      status: "ok",
      serverHmac
    });

    await expect(pairing).resolves.toBe(true);
    await vi.waitFor(() => expect(socket?.sent).toHaveLength(5));
    const protectedState = parseSent(socket, 4);
    expect(protectedState).toMatchObject({
      type: "protected",
      session: binding.session,
      direction: "extension_to_plugin",
      seq: 1,
      message: { type: "state", meetingMultiplicity: "none" }
    });
    if (protectedState?.type !== "protected") {
      throw new Error("Expected protected state");
    }

    const outboundKey = await deriveSessionHmacKey(
      token,
      encodeSessionKeySalt(binding),
      encodeSessionKeyInfo(binding, "extension_to_plugin")
    );
    await expect(
      verifyWithKey(outboundKey, encodeProtectedMessageMacInput(protectedState), protectedState.mac)
    ).resolves.toBe(true);

    const inboundKey = await deriveSessionHmacKey(
      token,
      encodeSessionKeySalt(binding),
      encodeSessionKeyInfo(binding, "plugin_to_extension")
    );
    const commandInput: ProtectedMacInput = {
      v: PROTOCOL_VERSION,
      type: "protected",
      session: binding.session,
      direction: "plugin_to_extension",
      seq: 1,
      message: {
        v: PROTOCOL_VERSION,
        type: "command",
        id: "microphone-command",
        action: "microphone.set",
        value: false
      }
    };
    const commandFrame = {
      ...commandInput,
      mac: await signWithKey(inboundKey, encodeProtectedMessageMacInput(commandInput))
    };
    socket?.serverMessage(commandFrame);
    await vi.waitFor(() => expect(socket?.sent).toHaveLength(6));
    expect(onCommand).toHaveBeenCalledOnce();
    expect(parseSent(socket, 5)).toMatchObject({
      type: "protected",
      direction: "extension_to_plugin",
      seq: 2,
      message: { type: "result", id: "microphone-command", status: "ok" }
    });

    socket?.serverMessage(commandFrame);
    await vi.waitFor(() => expect(bridge.status("none").authentication).toBe("rejected"));
    expect(onCommand).toHaveBeenCalledOnce();

    await bridge.forgetPairing();
  });

  it("rejects a hostile loopback peer before sending the pairing key or storing its token", async () => {
    const bridge = createBridge();
    await bridge.start();

    const pairing = bridge.pair(PAIRING_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const hostileSocket = FakeWebSocket.instances[0];
    hostileSocket?.open();
    const hello = parseSent(hostileSocket, 0);
    if (hello?.type !== "pair.hello") {
      throw new Error("Expected pair hello");
    }
    expect(JSON.stringify(hello)).not.toContain(PAIRING_KEY);

    const binding: PairingBinding = {
      clientNonce: hello.clientNonce,
      serverNonce: encodeBase64Url(new Uint8Array(32).fill(41)),
      origin: ORIGIN,
      clientRole: "extension",
      serverRole: "plugin"
    };
    hostileSocket?.serverMessage({
      v: 1,
      type: "pair.challenge",
      ...binding,
      serverHmac: await hmacSha256TextKey(
        "QRSTUVWXYZ23456789ABCDEFG",
        encodePairingProofInput(binding, "plugin")
      )
    });

    await expect(pairing).resolves.toBe(false);
    expect(hostileSocket?.sent).toHaveLength(1);
    expect(storage.has("meetDeck.bridge.v1")).toBe(false);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: false,
      problem: "invalid_pairing_code"
    });
  });

  it("rejects an attacker-chosen token before the local peer proves the pairing key", async () => {
    const bridge = createBridge();
    await bridge.start();

    const pairing = bridge.pair(PAIRING_KEY);
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const hostileSocket = FakeWebSocket.instances[0];
    hostileSocket?.open();
    const hello = parseSent(hostileSocket, 0);
    expect(hello).toMatchObject({ type: "pair.hello", origin: ORIGIN, role: "extension" });
    expect(JSON.stringify(hello)).not.toContain(PAIRING_KEY);

    const attackerToken = encodeBase64Url(new Uint8Array(32).fill(43));
    hostileSocket?.serverMessage({ v: 1, type: "pair.granted", token: attackerToken });

    await expect(pairing).resolves.toBe(false);
    expect(storage.has("meetDeck.bridge.v1")).toBe(false);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      paired: false,
      problem: "protocol_error"
    });
  });

  it("fails closed when a paired local server stays silent after auth hello", async () => {
    vi.useFakeTimers();
    const token = encodeBase64Url(new Uint8Array(32).fill(5));
    storage.set("meetDeck.bridge.v1", { port: 53_421, token });
    const bridge = new BridgeClient({
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
      onStatusChange: vi.fn()
    });

    await bridge.start();
    const socket = FakeWebSocket.instances[0];
    socket?.open();
    expect(parseSent(socket, 0)).toMatchObject({ type: "auth.hello" });

    await vi.advanceTimersByTimeAsync(8_000);
    expect(bridge.status("none")).toMatchObject({
      authentication: "rejected",
      connection: "disconnected",
      problem: "authentication_failed"
    });

    await bridge.forgetPairing();
  });

  it("keeps in-memory pairing intact when forgetting fails to persist", async () => {
    const token = encodeBase64Url(new Uint8Array(32).fill(13));
    storage.set("meetDeck.bridge.v1", { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();
    const socket = FakeWebSocket.instances[0];
    storageSet.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(bridge.forgetPairing()).rejects.toThrow("storage unavailable");

    expect(bridge.status("none")).toMatchObject({
      authentication: "pairing",
      connection: "connecting",
      port: 53_421
    });
    expect(socket?.readyState).toBe(FakeWebSocket.CONNECTING);
    expect(storage.get("meetDeck.bridge.v1")).toEqual({ port: 53_421, token });
  });

  it("does not commit a new port when its durable write fails", async () => {
    const bridge = createBridge();
    await bridge.start();
    storageSet.mockRejectedValueOnce(new Error("storage unavailable"));

    await expect(bridge.setPort(54_321)).rejects.toThrow("storage unavailable");

    expect(bridge.status("none").port).toBe(53_421);
    expect(storage.has("meetDeck.bridge.v1")).toBe(false);
  });

  it("waits for a new exact-port grant before reconnecting after a paired port change", async () => {
    const token = encodeBase64Url(new Uint8Array(32).fill(15));
    storage.set("meetDeck.bridge.v1", { port: 53_421, token });
    const bridge = createBridge();
    await bridge.start();

    await bridge.setPort(54_321);

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(bridge.status("none")).toMatchObject({
      authentication: "pairing",
      connection: "disconnected",
      paired: true,
      port: 54_321,
      problem: "loopback_permission_required"
    });

    expect(bridge.resumeAfterPermissionGrant()).toBe(true);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe("ws://127.0.0.1:54321/v1");

    await bridge.forgetPairing();
  });

  it("serialises parallel port writes and commits each only after persistence", async () => {
    const bridge = createBridge();
    await bridge.start();
    let releaseFirst: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    storageSet
      .mockImplementationOnce(async (items: Record<string, unknown>) => {
        await firstWrite;
        for (const [key, value] of Object.entries(items)) {
          storage.set(key, value);
        }
      })
      .mockImplementationOnce(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          storage.set(key, value);
        }
      });

    const first = bridge.setPort(54_321);
    const second = bridge.setPort(55_321);
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalledTimes(1));
    expect(bridge.status("none").port).toBe(53_421);

    releaseFirst?.();
    await first;
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalledTimes(2));
    await second;

    expect(storageSet.mock.calls).toEqual([
      [{ "meetDeck.bridge.v1": { port: 54_321 } }],
      [{ "meetDeck.bridge.v1": { port: 55_321 } }]
    ]);
    expect(bridge.status("none").port).toBe(55_321);
    expect(storage.get("meetDeck.bridge.v1")).toEqual({ port: 55_321 });
  });

  it("adopts a durable pair grant when its socket closes during slow storage", async () => {
    vi.useFakeTimers();
    const bridge = createBridge();
    await bridge.start();
    let releaseStorage: (() => void) | undefined;
    const storageGate = new Promise<void>((resolve) => {
      releaseStorage = resolve;
    });
    storageSet.mockImplementationOnce(async (items: Record<string, unknown>) => {
      await storageGate;
      for (const [key, value] of Object.entries(items)) {
        storage.set(key, value);
      }
    });

    const pairing = bridge.pair(PAIRING_KEY);
    await vi.advanceTimersByTimeAsync(0);
    const grantingSocket = FakeWebSocket.instances[0];
    grantingSocket?.open();
    const pairHello = parseSent(grantingSocket, 0);
    if (pairHello?.type !== "pair.hello") {
      throw new Error("Expected pair hello before durable pairing commit");
    }
    const pairingBinding: PairingBinding = {
      clientNonce: pairHello.clientNonce,
      serverNonce: encodeBase64Url(new Uint8Array(32).fill(25)),
      origin: ORIGIN,
      clientRole: "extension",
      serverRole: "plugin"
    };
    grantingSocket?.serverMessage({
      v: 1,
      type: "pair.challenge",
      ...pairingBinding,
      serverHmac: await hmacSha256TextKey(
        PAIRING_KEY,
        encodePairingProofInput(pairingBinding, "plugin")
      )
    });
    await vi.waitFor(() => expect(grantingSocket?.sent).toHaveLength(2));

    const token = encodeBase64Url(new Uint8Array(32).fill(27));
    grantingSocket?.serverMessage({ v: 1, type: "pair.granted", token });
    await vi.waitFor(() => expect(storageSet).toHaveBeenCalledOnce());

    grantingSocket?.close();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(bridge.status("none").authentication).toBe("pairing");

    releaseStorage?.();
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    const authenticationSocket = FakeWebSocket.instances[1];
    authenticationSocket?.open();
    const hello = parseSent(authenticationSocket, 0);
    expect(hello).toMatchObject({ type: "auth.hello" });
    if (hello?.type !== "auth.hello") {
      throw new Error("Expected auth hello after durable pairing commit");
    }

    const binding: AuthBinding = {
      session: encodeBase64Url(new Uint8Array(32).fill(29)),
      clientNonce: hello.clientNonce,
      serverNonce: encodeBase64Url(new Uint8Array(32).fill(31)),
      origin: ORIGIN,
      clientRole: "extension",
      serverRole: "plugin"
    };
    authenticationSocket?.serverMessage({ v: 1, type: "auth.challenge", ...binding });
    await vi.waitFor(() => expect(authenticationSocket?.sent).toHaveLength(2));
    authenticationSocket?.serverMessage({
      v: 1,
      type: "auth.result",
      session: binding.session,
      status: "ok",
      serverHmac: await hmacSha256Bytes(token, encodeAuthProofInput(binding, "plugin"))
    });

    await expect(pairing).resolves.toBe(true);
    expect(storage.get("meetDeck.bridge.v1")).toEqual({ port: 53_421, token });
    expect(bridge.status("none").authentication).toBe("authenticated");
    await bridge.forgetPairing();
  });
});

function createBridge(): BridgeClient {
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
    onStatusChange: vi.fn()
  });
}

function parseSent(socket: FakeWebSocket | undefined, index: number) {
  const raw = socket?.sent[index];
  if (raw === undefined) {
    return undefined;
  }
  const parsed = safeParseProtocolMessage(raw);
  return parsed.success ? parsed.data : undefined;
}
