import type { IncomingMessage } from "node:http";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface FakeSocketHarness {
  readonly sent: string[];
  readonly closes: Array<{
    readonly code: number | undefined;
    readonly reason: string | undefined;
  }>;
  emit(event: string, ...arguments_: unknown[]): boolean;
}

interface FakeServerHarness {
  readonly options: {
    readonly verifyClient: (info: { readonly req: IncomingMessage }) => boolean;
  };
  emit(event: string, ...arguments_: unknown[]): boolean;
}

const webSocketHarness = vi.hoisted(() => ({ servers: [] as unknown[] }));

vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");

  class FakeWebSocket extends EventEmitter {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly sent: string[] = [];
    readonly closes: Array<{
      readonly code: number | undefined;
      readonly reason: string | undefined;
    }> = [];
    readyState = FakeWebSocket.OPEN;

    send(data: string): void {
      this.sent.push(data);
    }

    close(code?: number, reason?: string): void {
      // Deliberately keep readyState OPEN. This exercises logical invalidation
      // without relying on a graceful WebSocket close event.
      this.closes.push({ code, reason });
    }
  }

  class FakeWebSocketServer extends EventEmitter {
    readonly options: unknown;

    constructor(options: unknown) {
      super();
      this.options = options;
      webSocketHarness.servers.push(this);
      queueMicrotask(() => this.emit("listening"));
    }

    close(callback: () => void): void {
      callback();
    }
  }

  return { default: FakeWebSocket, WebSocketServer: FakeWebSocketServer };
});

import {
  PROTOCOL_VERSION,
  encodeProtectedMessageMacInput,
  parseProtocolMessage,
  serializeProtocolMessage,
  type AuthBinding,
  type ProtectedMacInput,
  type ProtocolMessage
} from "@meet-deck/protocol";
import WebSocket from "ws";

import {
  AUTH_TIMEOUT_MS,
  BRIDGE_PATH,
  BRIDGE_SUBPROTOCOL,
  BridgeServer,
  isUpgradeAllowed,
  type PairingCredentials
} from "../src/bridge-server.js";
import { PAIRING_TTL_MS, createMac, createProof, deriveSessionKey } from "../src/security.js";

const oldOrigin = `chrome-extension://${"a".repeat(32)}`;
const newOrigin = `chrome-extension://${"b".repeat(32)}`;
const oldCredentials: PairingCredentials = {
  pairingToken: Buffer.alloc(32, 7).toString("base64url"),
  pinnedOrigin: oldOrigin
};

const bridges: BridgeServer[] = [];

function request(origin: string, port = 53_421): IncomingMessage {
  return {
    url: BRIDGE_PATH,
    rawHeaders: [
      "Host",
      `127.0.0.1:${port}`,
      "Origin",
      origin,
      "Sec-WebSocket-Protocol",
      BRIDGE_SUBPROTOCOL
    ]
  } as IncomingMessage;
}

function currentServer(): FakeServerHarness {
  const server = webSocketHarness.servers.at(-1);
  if (server === undefined) {
    throw new Error("Bridge server was not created");
  }
  return server as FakeServerHarness;
}

function createSocket(): FakeSocketHarness {
  return new WebSocket("ws://127.0.0.1:53421/v1") as unknown as FakeSocketHarness;
}

function connect(socket: FakeSocketHarness, origin: string, server = currentServer()): void {
  server.emit("connection", socket, request(origin));
}

function send(socket: FakeSocketHarness, message: ProtocolMessage): void {
  socket.emit("message", Buffer.from(serializeProtocolMessage(message)), false);
}

function sent(socket: FakeSocketHarness, index: number): ProtocolMessage {
  const frame = socket.sent[index];
  if (frame === undefined) {
    throw new Error(`Missing outbound frame ${index}`);
  }
  return parseProtocolMessage(frame);
}

function deferredVoid(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

function createBridge(
  persistCredentials: (credentials: PairingCredentials | undefined) => Promise<void> = async () =>
    undefined
): { readonly bridge: BridgeServer } {
  const bridge = new BridgeServer({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    persistCredentials
  });
  bridges.push(bridge);
  return { bridge };
}

function pairingCode(status: { readonly pairingCode?: string }): string {
  if (status.pairingCode === undefined) {
    throw new Error("Pairing did not open");
  }
  return status.pairingCode;
}

async function authenticate(
  bridge: BridgeServer,
  credentials: PairingCredentials
): Promise<{
  readonly socket: FakeSocketHarness;
  readonly binding: AuthBinding;
}> {
  bridge.setCredentials(credentials);
  const socket = createSocket();
  connect(socket, credentials.pinnedOrigin);
  send(socket, {
    v: PROTOCOL_VERSION,
    type: "auth.hello",
    clientNonce: Buffer.alloc(32, 8).toString("base64url"),
    origin: credentials.pinnedOrigin,
    role: "extension"
  });
  const challenge = sent(socket, 0);
  if (challenge.type !== "auth.challenge") {
    throw new Error("Expected authentication challenge");
  }
  const binding: AuthBinding = {
    session: challenge.session,
    clientNonce: challenge.clientNonce,
    serverNonce: challenge.serverNonce,
    origin: challenge.origin,
    clientRole: challenge.clientRole,
    serverRole: challenge.serverRole
  };
  send(socket, {
    v: PROTOCOL_VERSION,
    type: "auth.response",
    ...binding,
    hmac: createProof(credentials.pairingToken, binding, "extension")
  });
  await Promise.resolve();
  expect(sent(socket, 1)).toMatchObject({ type: "auth.result", status: "ok" });
  return { socket, binding };
}

function protectedState(credentials: PairingCredentials, binding: AuthBinding): ProtocolMessage {
  const input: ProtectedMacInput = {
    v: PROTOCOL_VERSION,
    type: "protected",
    session: binding.session,
    direction: "extension_to_plugin",
    seq: 1,
    message: {
      v: PROTOCOL_VERSION,
      type: "state",
      meetingMultiplicity: "one",
      microphone: "off",
      camera: "off",
      hand: "lowered",
      selfPresentation: "inactive"
    }
  };
  const key = deriveSessionKey(credentials.pairingToken, binding, "extension_to_plugin");
  return { ...input, mac: createMac(key, encodeProtectedMessageMacInput(input)) };
}

beforeEach(() => {
  webSocketHarness.servers.length = 0;
});

afterEach(async () => {
  await Promise.all(bridges.splice(0).map(async (bridge) => bridge.stop()));
  vi.useRealTimers();
});

describe("Bridge credential lifecycle", () => {
  it("invalidates an authenticated session synchronously while unpair persistence is pending", async () => {
    const persistence = deferredVoid();
    const persistCredentials = vi.fn(() => persistence.promise);
    const { bridge } = createBridge(persistCredentials);
    await bridge.start();
    const authenticated = await authenticate(bridge, oldCredentials);
    const applicationListener = vi.fn();
    bridge.onApplication(applicationListener);

    const unpairing = bridge.unpair();
    expect(bridge.connected).toBe(false);
    expect(authenticated.socket.closes).toContainEqual({ code: 4001, reason: "Pairing changed" });

    send(authenticated.socket, protectedState(oldCredentials, authenticated.binding));
    expect(applicationListener).not.toHaveBeenCalled();

    persistence.resolve();
    await unpairing;
    expect(bridge.credentials).toBeUndefined();
  });

  it("limits a pairing socket to five seconds before its first request", async () => {
    const { bridge } = createBridge();
    await bridge.start();
    vi.useFakeTimers();
    bridge.startPairing();
    const socket = createSocket();
    connect(socket, newOrigin);

    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS - 1);
    expect(socket.closes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(socket.closes).toContainEqual({
      code: 1008,
      reason: "Authentication timed out"
    });
  });

  it("cleans the pairing window and emits a safe status when credential persistence fails", async () => {
    const persistCredentials = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    const { bridge } = createBridge(persistCredentials);
    await bridge.start();
    vi.useFakeTimers();
    const statusListener = vi.fn();
    bridge.onStatus(statusListener);
    const pairing = bridge.startPairing();
    const socket = createSocket();
    connect(socket, newOrigin);

    send(socket, {
      v: PROTOCOL_VERSION,
      type: "pair.request",
      code: pairingCode(pairing)
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(socket.closes).toContainEqual({ code: 1011, reason: "Pairing could not be saved" });
    const failedStatus = bridge.status();
    expect(failedStatus).not.toHaveProperty("pairingCode");
    expect(failedStatus.error).toBe("Pairing could not be saved.");
    const callsAfterFailure = statusListener.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PAIRING_TTL_MS);
    expect(statusListener).toHaveBeenCalledTimes(callsAfterFailure);
  });

  it("blocks old authentication and rolls back a pairing interrupted by restart", async () => {
    const candidatePersistence = deferredVoid();
    const persistCredentials = vi
      .fn<(credentials: PairingCredentials | undefined) => Promise<void>>(async () => undefined)
      .mockImplementationOnce(() => candidatePersistence.promise);
    const { bridge } = createBridge(persistCredentials);
    await bridge.start();
    await authenticate(bridge, oldCredentials);

    const pairing = bridge.startPairing();
    const pairingSocket = createSocket();
    const originalServer = currentServer();
    connect(pairingSocket, newOrigin, originalServer);
    send(pairingSocket, {
      v: PROTOCOL_VERSION,
      type: "pair.request",
      code: pairingCode(pairing)
    });
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(1));

    expect(originalServer.options.verifyClient({ req: request(oldOrigin) })).toBe(false);
    const oldReconnect = createSocket();
    connect(oldReconnect, oldOrigin, originalServer);
    send(oldReconnect, {
      v: PROTOCOL_VERSION,
      type: "auth.hello",
      clientNonce: Buffer.alloc(32, 9).toString("base64url"),
      origin: oldOrigin,
      role: "extension"
    });
    expect(oldReconnect.closes).toContainEqual({
      code: 1008,
      reason: "Authentication rejected"
    });

    await bridge.restart(53_422);
    candidatePersistence.resolve();
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(2));

    expect(persistCredentials).toHaveBeenLastCalledWith(oldCredentials);
    expect(pairingSocket.sent).toHaveLength(0);
    expect(bridge.credentials).toEqual(oldCredentials);
    expect(bridge.status()).toMatchObject({
      connected: false,
      error: "Pairing was interrupted. Start pairing again."
    });
  });

  it("rolls back durable candidate credentials when pairing is cancelled", async () => {
    const candidatePersistence = deferredVoid();
    const persistCredentials = vi
      .fn<(credentials: PairingCredentials | undefined) => Promise<void>>(async () => undefined)
      .mockImplementationOnce(() => candidatePersistence.promise);
    const { bridge } = createBridge(persistCredentials);
    bridge.setCredentials(oldCredentials);
    await bridge.start();

    const pairing = bridge.startPairing();
    const socket = createSocket();
    connect(socket, newOrigin);
    send(socket, {
      v: PROTOCOL_VERSION,
      type: "pair.request",
      code: pairingCode(pairing)
    });
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(1));

    bridge.cancelPairing();
    expect(socket.closes).toContainEqual({ code: 4001, reason: "Pairing cancelled" });
    candidatePersistence.resolve();
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(2));

    expect(persistCredentials).toHaveBeenLastCalledWith(oldCredentials);
    expect(socket.sent).toHaveLength(0);
    expect(bridge.status().pairingCode).toBeUndefined();
  });

  it("keeps unpair authoritative over a delayed re-pair persistence", async () => {
    const candidatePersistence = deferredVoid();
    const persistCredentials = vi
      .fn<(credentials: PairingCredentials | undefined) => Promise<void>>(async () => undefined)
      .mockImplementationOnce(() => candidatePersistence.promise);
    const { bridge } = createBridge(persistCredentials);
    bridge.setCredentials(oldCredentials);
    await bridge.start();

    const pairing = bridge.startPairing();
    const socket = createSocket();
    connect(socket, newOrigin);
    send(socket, {
      v: PROTOCOL_VERSION,
      type: "pair.request",
      code: pairingCode(pairing)
    });
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(1));

    await bridge.unpair();
    expect(bridge.credentials).toBeUndefined();
    candidatePersistence.resolve();
    await vi.waitFor(() => expect(persistCredentials).toHaveBeenCalledTimes(3));

    expect(persistCredentials.mock.calls[1]?.[0]).toBeUndefined();
    expect(persistCredentials).toHaveBeenLastCalledWith(undefined);
    expect(socket.sent).toHaveLength(0);
    expect(bridge.credentials).toBeUndefined();
  });
});

describe("upgrade policy during pairing commit", () => {
  it("rejects every upgrade while candidate credentials are being committed", () => {
    expect(
      isUpgradeAllowed(request(oldOrigin), {
        port: 53_421,
        pinnedOrigin: oldOrigin,
        pairingOpen: false,
        pairingCommitInProgress: true,
        unauthenticatedConnections: 0
      })
    ).toBe(false);
  });
});
