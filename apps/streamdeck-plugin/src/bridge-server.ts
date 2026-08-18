import type { IncomingMessage } from "node:http";

import {
  MAX_MESSAGE_BYTES,
  PROTOCOL_VERSION,
  ProtectedMessageReplayGuard,
  encodeProtectedMessageMacInput,
  safeParseProtocolMessage,
  serializeProtocolMessage,
  type ApplicationMessage,
  type AuthBinding,
  type CommandMessage,
  type MeetingStateMessage,
  type ProtectedMacInput,
  type ProtectedMessage,
  type ProtocolMessage,
  type ResultMessage
} from "@meet-deck/protocol";
import WebSocket, { WebSocketServer, type RawData } from "ws";

import {
  DEFAULT_BRIDGE_PORT,
  PairingManager,
  createMac,
  createProof,
  deriveSessionKey,
  isChromeExtensionOrigin,
  randomBase64Url,
  verifyMac,
  verifyProof
} from "./security.js";

export const BRIDGE_HOST = "127.0.0.1";
export const BRIDGE_PATH = "/v1";
export const BRIDGE_SUBPROTOCOL = "meet-deck-v1";
export const MAX_UNAUTHENTICATED_CONNECTIONS = 3;
export const AUTH_TIMEOUT_MS = 5_000;
export const HEARTBEAT_INTERVAL_MS = 20_000;
export const HEARTBEAT_TIMEOUT_MS = 45_000;
export const COMMAND_RATE_LIMIT = 10;

export interface PairingCredentials {
  readonly pairingToken: string;
  readonly pinnedOrigin: string;
}

export interface BridgeStatus {
  readonly type: "bridge.status";
  readonly port: number;
  readonly listening: boolean;
  readonly paired: boolean;
  readonly connected: boolean;
  readonly pairingCode?: string;
  readonly pairingExpiresAt?: number;
  readonly error?: string;
}

export interface BridgeLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface UpgradePolicy {
  readonly port: number;
  readonly pinnedOrigin?: string;
  readonly pairingOpen: boolean;
  readonly pairingCommitInProgress?: boolean;
  readonly unauthenticatedConnections: number;
}

export interface BridgeServerOptions {
  readonly logger: BridgeLogger;
  readonly persistCredentials: (credentials: PairingCredentials | undefined) => Promise<void>;
}

type ApplicationListener = (message: MeetingStateMessage | ResultMessage) => void;
type StatusListener = (status: BridgeStatus) => void;
type SocketPhase = "awaiting" | "pairing" | "challenged" | "authenticated" | "invalidated";

interface SocketState {
  readonly socket: WebSocket;
  readonly origin: string;
  readonly replayGuard: ProtectedMessageReplayGuard;
  phase: SocketPhase;
  binding: AuthBinding | undefined;
  inboundKey: Buffer | undefined;
  outboundKey: Buffer | undefined;
  sentSequence: number;
  lastPongAt: number;
  lastPingNonce: string | undefined;
  authTimer: NodeJS.Timeout | undefined;
  heartbeatTimer: NodeJS.Timeout | undefined;
}

interface PairingPersistenceAttempt {
  readonly generation: number;
  readonly state: SocketState;
}

function singleRawHeader(request: IncomingMessage, name: string): string | undefined {
  const values: string[] = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (request.rawHeaders[index]?.toLowerCase() === name) {
      const value = request.rawHeaders[index + 1];
      if (value !== undefined) {
        values.push(value);
      }
    }
  }
  return values.length === 1 ? values[0] : undefined;
}

export function isUpgradeAllowed(request: IncomingMessage, policy: UpgradePolicy): boolean {
  if (
    request.url !== BRIDGE_PATH ||
    singleRawHeader(request, "host") !== `${BRIDGE_HOST}:${policy.port}` ||
    singleRawHeader(request, "sec-websocket-protocol") !== BRIDGE_SUBPROTOCOL ||
    policy.pairingCommitInProgress === true ||
    policy.unauthenticatedConnections >= MAX_UNAUTHENTICATED_CONNECTIONS
  ) {
    return false;
  }

  const origin = singleRawHeader(request, "origin");
  if (!isChromeExtensionOrigin(origin)) {
    return false;
  }

  if (policy.pairingOpen) {
    return true;
  }
  return policy.pinnedOrigin !== undefined && origin === policy.pinnedOrigin;
}

function bindingsEqual(left: AuthBinding, right: AuthBinding): boolean {
  return (
    left.session === right.session &&
    left.clientNonce === right.clientNonce &&
    left.serverNonce === right.serverNonce &&
    left.origin === right.origin &&
    left.clientRole === right.clientRole &&
    left.serverRole === right.serverRole
  );
}

function closeSocket(socket: WebSocket, code: number, reason: string): void {
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(code, reason);
  }
}

export class BridgeServer {
  readonly #logger: BridgeLogger;
  readonly #persistCredentials: BridgeServerOptions["persistCredentials"];
  readonly #pairing = new PairingManager();
  readonly #connections = new Map<WebSocket, SocketState>();
  readonly #applicationListeners = new Set<ApplicationListener>();
  readonly #statusListeners = new Set<StatusListener>();
  readonly #commandTimestamps: number[] = [];

  #server: WebSocketServer | undefined;
  #credentials: PairingCredentials | undefined;
  #active: SocketState | undefined;
  #pairingPersistenceAttempt: PairingPersistenceAttempt | undefined;
  #pairingGeneration = 0;
  #pairingExpiryTimer: NodeJS.Timeout | undefined;
  #port = DEFAULT_BRIDGE_PORT;
  #lastError: string | undefined;

  constructor(options: BridgeServerOptions) {
    this.#logger = options.logger;
    this.#persistCredentials = options.persistCredentials;
  }

  get port(): number {
    return this.#port;
  }

  get connected(): boolean {
    return (
      this.#active?.phase === "authenticated" && this.#active.socket.readyState === WebSocket.OPEN
    );
  }

  get credentials(): PairingCredentials | undefined {
    return this.#credentials;
  }

  setCredentials(credentials: PairingCredentials | undefined): void {
    const changed =
      this.#credentials?.pairingToken !== credentials?.pairingToken ||
      this.#credentials?.pinnedOrigin !== credentials?.pinnedOrigin;
    this.#credentials = credentials;
    if (changed) {
      this.#invalidatePairingAttempt(4001, "Pairing changed");
      for (const connection of this.#connections.values()) {
        this.#invalidateConnection(connection, 4001, "Pairing changed", false);
      }
      this.#commandTimestamps.length = 0;
    }
    this.#emitStatus();
  }

  onApplication(listener: ApplicationListener): () => void {
    this.#applicationListeners.add(listener);
    return () => this.#applicationListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.#statusListeners.add(listener);
    listener(this.status());
    return () => this.#statusListeners.delete(listener);
  }

  status(): BridgeStatus {
    const pairing = this.#pairing.snapshot();
    return {
      type: "bridge.status",
      port: this.#port,
      listening: this.#server !== undefined,
      paired: this.#credentials !== undefined,
      connected: this.connected,
      ...(pairing === undefined
        ? {}
        : { pairingCode: pairing.code, pairingExpiresAt: pairing.expiresAt }),
      ...(this.#lastError === undefined ? {} : { error: this.#lastError })
    };
  }

  async start(port = this.#port): Promise<void> {
    if (this.#server !== undefined) {
      await this.stop();
    }
    this.#port = port;
    this.#lastError = undefined;

    const server = new WebSocketServer({
      host: BRIDGE_HOST,
      port,
      path: BRIDGE_PATH,
      maxPayload: MAX_MESSAGE_BYTES,
      perMessageDeflate: false,
      clientTracking: false,
      handleProtocols(protocols) {
        return protocols.size === 1 && protocols.has(BRIDGE_SUBPROTOCOL)
          ? BRIDGE_SUBPROTOCOL
          : false;
      },
      verifyClient: (info: { req: IncomingMessage }) =>
        isUpgradeAllowed(info.req, {
          port: this.#port,
          pairingOpen: this.#pairing.isOpen(),
          pairingCommitInProgress: this.#pairingPersistenceAttempt !== undefined,
          unauthenticatedConnections: this.#unauthenticatedConnectionCount(),
          ...(this.#credentials === undefined
            ? {}
            : { pinnedOrigin: this.#credentials.pinnedOrigin })
        })
    });
    server.on("connection", (socket, request) => this.#onConnection(socket, request));

    try {
      await new Promise<void>((resolve, reject) => {
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        server.once("listening", onListening);
        server.once("error", onError);
      });
    } catch (error) {
      this.#lastError =
        error instanceof Error && "code" in error && error.code === "EADDRINUSE"
          ? `Port ${port} is already in use.`
          : "The local bridge could not be started.";
      this.#logger.error("Meet Deck bridge failed to listen on loopback.");
      this.#emitStatus();
      throw error;
    }

    this.#server = server;
    server.on("error", () => {
      this.#lastError = "The local bridge encountered an error.";
      this.#logger.error("Meet Deck bridge encountered a server error.");
      this.#emitStatus();
    });
    this.#logger.info(`Meet Deck bridge listening on ${BRIDGE_HOST}:${port}.`);
    this.#emitStatus();
  }

  async restart(port: number): Promise<void> {
    await this.stop();
    await this.start(port);
  }

  async stop(): Promise<void> {
    this.#invalidatePairingAttempt(1001, "Bridge stopping");
    this.#clearPairingWindow();
    for (const connection of this.#connections.values()) {
      this.#invalidateConnection(connection, 1001, "Bridge stopping", false);
    }
    this.#connections.clear();
    this.#active = undefined;

    const server = this.#server;
    this.#server = undefined;
    if (server !== undefined) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    this.#emitStatus();
  }

  startPairing(): BridgeStatus {
    if (this.#pairingPersistenceAttempt !== undefined) {
      this.#invalidatePairingAttempt(4001, "Pairing restarted");
      this.#clearPairingWindow();
      this.#lastError = "The previous pairing attempt is still being finalized. Try again.";
      this.#emitStatus();
      return this.status();
    }
    this.#pairingGeneration += 1;
    this.#lastError = undefined;
    const pairing = this.#pairing.start();
    if (this.#pairingExpiryTimer !== undefined) {
      clearTimeout(this.#pairingExpiryTimer);
    }
    this.#pairingExpiryTimer = setTimeout(
      () => {
        this.#pairingExpiryTimer = undefined;
        this.#emitStatus();
      },
      Math.max(0, pairing.expiresAt - Date.now())
    );
    this.#pairingExpiryTimer.unref();
    this.#emitStatus();
    return this.status();
  }

  cancelPairing(): void {
    this.#invalidatePairingAttempt(4001, "Pairing cancelled");
    this.#clearPairingWindow();
    this.#emitStatus();
  }

  async unpair(): Promise<void> {
    this.#invalidatePairingAttempt(4001, "Pairing removed");
    this.#clearPairingWindow();
    const previousCredentials = this.#credentials;
    this.setCredentials(undefined);
    try {
      await this.#persistCredentials(undefined);
    } catch (error) {
      this.#credentials = previousCredentials;
      this.#lastError = "Pairing could not be removed.";
      this.#emitStatus();
      throw error;
    }
  }

  sendCommand(message: CommandMessage): boolean {
    const now = Date.now();
    while (this.#commandTimestamps[0] !== undefined && now - this.#commandTimestamps[0] >= 1_000) {
      this.#commandTimestamps.shift();
    }
    if (this.#commandTimestamps.length >= COMMAND_RATE_LIMIT) {
      return false;
    }
    const sent = this.#sendProtected(this.#active, message);
    if (sent) {
      this.#commandTimestamps.push(now);
    }
    return sent;
  }

  #unauthenticatedConnectionCount(): number {
    let count = 0;
    for (const connection of this.#connections.values()) {
      if (connection.phase !== "authenticated") {
        count += 1;
      }
    }
    return count;
  }

  #onConnection(socket: WebSocket, request: IncomingMessage): void {
    const origin = singleRawHeader(request, "origin");
    if (!isChromeExtensionOrigin(origin)) {
      closeSocket(socket, 1008, "Invalid origin");
      return;
    }

    const state: SocketState = {
      socket,
      origin,
      replayGuard: new ProtectedMessageReplayGuard(),
      phase: "awaiting",
      binding: undefined,
      inboundKey: undefined,
      outboundKey: undefined,
      sentSequence: 0,
      lastPongAt: Date.now(),
      lastPingNonce: undefined,
      authTimer: undefined,
      heartbeatTimer: undefined
    };
    state.authTimer = setTimeout(
      () => this.#invalidateConnection(state, 1008, "Authentication timed out"),
      AUTH_TIMEOUT_MS
    );
    state.authTimer.unref();
    this.#connections.set(socket, state);

    socket.on("message", (data, isBinary) => {
      void this.#onMessage(state, data, isBinary);
    });
    socket.on("close", () => this.#onClose(state));
    socket.on("error", () => {
      this.#logger.warn("Meet Deck bridge client connection failed.");
    });
  }

  async #onMessage(state: SocketState, data: RawData, isBinary: boolean): Promise<void> {
    if (state.phase === "pairing" || state.phase === "invalidated") {
      this.#invalidateConnection(state, 1008, "Unexpected protocol message");
      return;
    }
    if (isBinary || Array.isArray(data)) {
      this.#invalidateConnection(state, 1003, "Text messages only");
      return;
    }
    const frame = data instanceof ArrayBuffer ? data : new Uint8Array(data);
    const parsed = safeParseProtocolMessage(frame);
    if (!parsed.success) {
      this.#invalidateConnection(
        state,
        parsed.error.code === "too_large" ? 1009 : 1008,
        "Invalid protocol message"
      );
      return;
    }

    const message = parsed.data;
    if (state.phase === "authenticated") {
      if (message.type !== "protected") {
        this.#invalidateConnection(state, 1008, "Protected message required");
        return;
      }
      this.#onProtectedMessage(state, message);
      return;
    }

    if (message.type === "pair.request") {
      if (state.phase !== "awaiting") {
        this.#invalidateConnection(state, 1008, "Unexpected pairing request");
        return;
      }
      await this.#onPairRequest(state, message.code);
      return;
    }
    if (message.type === "auth.hello") {
      this.#onAuthHello(state, message);
      return;
    }
    if (message.type === "auth.response") {
      this.#onAuthResponse(state, message);
      return;
    }
    this.#invalidateConnection(state, 1008, "Unexpected protocol message");
  }

  async #onPairRequest(state: SocketState, code: string): Promise<void> {
    const attempt = this.#pairing.attempt(code);
    if (!attempt.ok) {
      this.#sendRaw(state.socket, {
        v: PROTOCOL_VERSION,
        type: "pair.rejected",
        reason: attempt.reason
      });
      if (!this.#pairing.isOpen()) {
        this.#clearPairingWindow();
      }
      this.#emitStatus();
      return;
    }

    state.phase = "pairing";
    if (state.authTimer !== undefined) {
      clearTimeout(state.authTimer);
      state.authTimer = undefined;
    }
    this.#clearPairingWindow();
    const pairingAttempt: PairingPersistenceAttempt = {
      generation: this.#pairingGeneration,
      state
    };
    this.#pairingPersistenceAttempt = pairingAttempt;
    for (const connection of this.#connections.values()) {
      if (connection !== state) {
        this.#invalidateConnection(connection, 4001, "Pairing changed", false);
      }
    }
    this.#commandTimestamps.length = 0;
    this.#emitStatus();

    const credentials: PairingCredentials = {
      pairingToken: attempt.token,
      pinnedOrigin: state.origin
    };
    let persisted = false;
    try {
      await this.#persistCredentials(credentials);
      persisted = true;
    } catch {
      this.#lastError = "Pairing could not be saved.";
      this.#logger.error("Meet Deck could not persist new pairing credentials.");
      this.#invalidateConnection(state, 1011, "Pairing could not be saved");
      this.#emitStatus();
      return;
    } finally {
      if (!persisted && this.#pairingPersistenceAttempt === pairingAttempt) {
        this.#pairingPersistenceAttempt = undefined;
      }
    }

    if (
      pairingAttempt.generation !== this.#pairingGeneration ||
      state.phase !== "pairing" ||
      state.socket.readyState !== WebSocket.OPEN
    ) {
      const restored = await this.#restoreCurrentCredentials();
      if (this.#pairingPersistenceAttempt === pairingAttempt) {
        this.#pairingPersistenceAttempt = undefined;
      }
      this.#lastError = restored
        ? "Pairing was interrupted. Start pairing again."
        : "Stored pairing settings could not be restored.";
      this.#invalidateConnection(state, 4001, "Pairing interrupted");
      this.#emitStatus();
      return;
    }

    this.#credentials = credentials;
    this.#lastError = undefined;
    if (this.#pairingPersistenceAttempt === pairingAttempt) {
      this.#pairingPersistenceAttempt = undefined;
    }
    for (const connection of this.#connections.values()) {
      if (connection !== state) {
        this.#invalidateConnection(connection, 4001, "Pairing changed", false);
      }
    }
    state.phase = "awaiting";
    this.#sendRaw(state.socket, {
      v: PROTOCOL_VERSION,
      type: "pair.granted",
      token: credentials.pairingToken
    });
    state.authTimer = setTimeout(
      () => this.#invalidateConnection(state, 1008, "Authentication timed out"),
      AUTH_TIMEOUT_MS
    );
    state.authTimer.unref();
    this.#emitStatus();
  }

  #onAuthHello(state: SocketState, hello: Extract<ProtocolMessage, { type: "auth.hello" }>): void {
    const credentials = this.#credentials;
    if (
      state.phase !== "awaiting" ||
      this.#pairingPersistenceAttempt !== undefined ||
      credentials === undefined ||
      credentials.pinnedOrigin !== state.origin ||
      hello.origin !== state.origin
    ) {
      this.#invalidateConnection(state, 1008, "Authentication rejected");
      return;
    }

    const binding: AuthBinding = {
      session: randomBase64Url(32),
      clientNonce: hello.clientNonce,
      serverNonce: randomBase64Url(32),
      origin: state.origin,
      clientRole: "extension",
      serverRole: "plugin"
    };
    state.binding = binding;
    state.phase = "challenged";
    if (state.authTimer !== undefined) {
      clearTimeout(state.authTimer);
    }
    state.authTimer = setTimeout(
      () => this.#invalidateConnection(state, 1008, "Authentication timed out"),
      AUTH_TIMEOUT_MS
    );
    state.authTimer.unref();
    this.#sendRaw(state.socket, {
      v: PROTOCOL_VERSION,
      type: "auth.challenge",
      ...binding
    });
  }

  #onAuthResponse(
    state: SocketState,
    response: Extract<ProtocolMessage, { type: "auth.response" }>
  ): void {
    const credentials = this.#credentials;
    const binding = state.binding;
    const responseBinding: AuthBinding = response;
    if (
      state.phase !== "challenged" ||
      this.#pairingPersistenceAttempt !== undefined ||
      credentials === undefined ||
      binding === undefined ||
      !bindingsEqual(binding, responseBinding) ||
      !verifyProof(credentials.pairingToken, binding, "extension", response.hmac)
    ) {
      this.#sendRaw(state.socket, {
        v: PROTOCOL_VERSION,
        type: "auth.result",
        session: response.session,
        status: "invalid"
      });
      this.#invalidateConnection(state, 1008, "Authentication rejected");
      return;
    }

    state.inboundKey = deriveSessionKey(credentials.pairingToken, binding, "extension_to_plugin");
    state.outboundKey = deriveSessionKey(credentials.pairingToken, binding, "plugin_to_extension");
    state.phase = "authenticated";
    if (state.authTimer !== undefined) {
      clearTimeout(state.authTimer);
      state.authTimer = undefined;
    }

    if (this.#active !== undefined && this.#active !== state) {
      this.#invalidateConnection(this.#active, 4002, "Replaced by a new session", false);
    }
    this.#active = state;
    this.#sendRaw(state.socket, {
      v: PROTOCOL_VERSION,
      type: "auth.result",
      session: binding.session,
      status: "ok",
      serverHmac: createProof(credentials.pairingToken, binding, "plugin")
    });
    this.#startHeartbeat(state);
    this.#emitStatus();
  }

  #onProtectedMessage(state: SocketState, frame: ProtectedMessage): void {
    const binding = state.binding;
    const inboundKey = state.inboundKey;
    if (
      binding === undefined ||
      inboundKey === undefined ||
      this.#active !== state ||
      frame.session !== binding.session ||
      frame.direction !== "extension_to_plugin"
    ) {
      this.#invalidateConnection(state, 1008, "Invalid protected session");
      return;
    }

    const macInput: ProtectedMacInput = {
      v: frame.v,
      type: frame.type,
      session: frame.session,
      direction: frame.direction,
      seq: frame.seq,
      message: frame.message
    };
    if (
      !verifyMac(inboundKey, encodeProtectedMessageMacInput(macInput), frame.mac) ||
      !state.replayGuard.acceptAuthenticated(frame)
    ) {
      this.#invalidateConnection(state, 1008, "Invalid or replayed protected message");
      return;
    }

    const message = frame.message;
    if (message.type === "ping") {
      this.#sendProtected(state, { v: PROTOCOL_VERSION, type: "pong", nonce: message.nonce });
      return;
    }
    if (message.type === "pong") {
      if (message.nonce === state.lastPingNonce) {
        state.lastPongAt = Date.now();
        state.lastPingNonce = undefined;
      }
      return;
    }
    if (message.type === "state" || message.type === "result") {
      for (const listener of this.#applicationListeners) {
        listener(message);
      }
      return;
    }
    this.#invalidateConnection(state, 1008, "Command direction is invalid");
  }

  #sendProtected(state: SocketState | undefined, message: ApplicationMessage): boolean {
    if (
      state === undefined ||
      state.phase !== "authenticated" ||
      state.binding === undefined ||
      state.outboundKey === undefined ||
      state.socket.readyState !== WebSocket.OPEN ||
      state.sentSequence >= Number.MAX_SAFE_INTEGER
    ) {
      return false;
    }

    state.sentSequence += 1;
    const input: ProtectedMacInput = {
      v: PROTOCOL_VERSION,
      type: "protected",
      session: state.binding.session,
      direction: "plugin_to_extension",
      seq: state.sentSequence,
      message
    };
    const frame: ProtectedMessage = {
      ...input,
      mac: createMac(state.outboundKey, encodeProtectedMessageMacInput(input))
    };
    this.#sendRaw(state.socket, frame);
    return true;
  }

  #sendRaw(socket: WebSocket, message: ProtocolMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeProtocolMessage(message));
    }
  }

  #startHeartbeat(state: SocketState): void {
    state.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      if (now - state.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.#invalidateConnection(state, 1008, "Heartbeat timed out");
        return;
      }
      const nonce = randomBase64Url(18);
      state.lastPingNonce = nonce;
      this.#sendProtected(state, { v: PROTOCOL_VERSION, type: "ping", nonce });
    }, HEARTBEAT_INTERVAL_MS);
    state.heartbeatTimer.unref();
  }

  #onClose(state: SocketState): void {
    const wasActive = this.#active === state;
    this.#clearConnectionState(state);
    this.#connections.delete(state.socket);
    if (wasActive) {
      this.#emitStatus();
    }
  }

  #invalidateConnection(state: SocketState, code: number, reason: string, emitStatus = true): void {
    const wasActive = this.#active === state;
    this.#clearConnectionState(state);
    closeSocket(state.socket, code, reason);
    if (wasActive && emitStatus) {
      this.#emitStatus();
    }
  }

  #clearConnectionState(state: SocketState): void {
    if (state.authTimer !== undefined) {
      clearTimeout(state.authTimer);
      state.authTimer = undefined;
    }
    if (state.heartbeatTimer !== undefined) {
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = undefined;
    }
    state.inboundKey?.fill(0);
    state.outboundKey?.fill(0);
    state.inboundKey = undefined;
    state.outboundKey = undefined;
    state.binding = undefined;
    state.replayGuard.clear();
    state.sentSequence = 0;
    state.lastPingNonce = undefined;
    state.phase = "invalidated";
    if (this.#active === state) {
      this.#active = undefined;
    }
  }

  #clearPairingWindow(): void {
    this.#pairing.cancel();
    if (this.#pairingExpiryTimer !== undefined) {
      clearTimeout(this.#pairingExpiryTimer);
      this.#pairingExpiryTimer = undefined;
    }
  }

  #invalidatePairingAttempt(code: number, reason: string): void {
    this.#pairingGeneration += 1;
    const pairingAttempt = this.#pairingPersistenceAttempt;
    if (pairingAttempt !== undefined) {
      this.#invalidateConnection(pairingAttempt.state, code, reason);
    }
  }

  async #restoreCurrentCredentials(): Promise<boolean> {
    try {
      await this.#persistCredentials(this.#credentials);
      return true;
    } catch {
      this.#logger.error("Meet Deck could not restore pairing credentials after interruption.");
      return false;
    }
  }

  #emitStatus(): void {
    const status = this.status();
    for (const listener of this.#statusListeners) {
      listener(status);
    }
  }
}
