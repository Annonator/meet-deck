import {
  PROTOCOL_VERSION,
  ProtectedMessageReplayGuard,
  encodeAuthProofInput,
  encodePairingProofInput,
  encodeProtectedMessageMacInput,
  encodeSessionKeyInfo,
  encodeSessionKeySalt,
  isPairingCode,
  safeParseProtocolMessage,
  serializeProtocolMessage,
  type ApplicationMessage,
  type AuthBinding,
  type AuthChallengeMessage,
  type AuthHelloMessage,
  type CommandMessage,
  type MeetingStateMessage,
  type PairRejectedMessage,
  type PairingBinding,
  type ProtectedMacInput,
  type ProtectedMessage,
  type ProtocolMessage,
  type ResultMessage
} from "@meet-deck/protocol";

import type { BridgeProblem, PublicBridgeStatus } from "../shared/extension-messages";
import {
  getLoopbackPermissionState,
  loopbackPermissionOrigin
} from "../shared/loopback-permission";
import {
  createNonce,
  deriveSessionHmacKey,
  hmacSha256Bytes,
  hmacSha256TextKey,
  signWithKey,
  verifyHmacSha256,
  verifyHmacSha256TextKey,
  verifyWithKey
} from "./crypto";
import {
  loadBridgeSettings,
  restrictStorageToTrustedContexts,
  saveBridgeSettings,
  type BridgeSettings
} from "./settings";

const WEB_SOCKET_SUBPROTOCOL = "meet-deck-v1";
const KEEPALIVE_INTERVAL_MS = 20_000;
const KEEPALIVE_TIMEOUT_MS = 45_000;
const PAIRING_TIMEOUT_MS = 15_000;
const AUTHENTICATION_TIMEOUT_MS = 7_000;
const MAX_BACKOFF_MS = 30_000;

interface AuthAttempt {
  binding?: AuthBinding;
  readonly clientNonce: string;
  readonly token: string;
}

interface PairingAttempt {
  binding: PairingBinding | undefined;
  challengePending: boolean;
  clientNonce: string;
  readonly key: string;
}

interface AuthenticatedSession {
  readonly binding: AuthBinding;
  readonly inboundKey: CryptoKey;
  readonly outboundKey: CryptoKey;
  outboundSequence: number;
  readonly replayGuard: ProtectedMessageReplayGuard;
}

interface PairWaiter {
  readonly resolve: (success: boolean) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export interface BridgeClientOptions {
  readonly getMeetingState: () => MeetingStateMessage;
  readonly onCommand: (command: CommandMessage) => Promise<ResultMessage>;
  readonly onStatusChange: () => void;
}

export class BridgeClient {
  readonly #options: BridgeClientOptions;
  #settings: BridgeSettings = { port: 53_421 };
  #socket: WebSocket | undefined;
  #connection: PublicBridgeStatus["connection"] = "disconnected";
  #authentication: PublicBridgeStatus["authentication"] = "unpaired";
  #problem: BridgeProblem | undefined;
  #pairingAttempt: PairingAttempt | undefined;
  #pairingGeneration = 0;
  #permissionCheckGeneration = 0;
  #pairingCommitGeneration: number | undefined;
  #authAttempt: AuthAttempt | undefined;
  #session: AuthenticatedSession | undefined;
  #pairWaiter: PairWaiter | undefined;
  #reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  #keepaliveTimer: ReturnType<typeof setInterval> | undefined;
  #authenticationTimer: ReturnType<typeof setTimeout> | undefined;
  #reconnectAttempt = 0;
  #suppressReconnect = false;
  #outboundQueue = Promise.resolve();
  #settingsOperationQueue = Promise.resolve();
  #lastPublishedState = "";
  readonly #pendingPings = new Map<string, number>();
  readonly #commandResults = new Map<string, ResultMessage>();
  readonly #inFlightCommands = new Map<string, Promise<ResultMessage>>();

  constructor(options: BridgeClientOptions) {
    this.#options = options;
  }

  async start(): Promise<void> {
    await restrictStorageToTrustedContexts();
    this.#settings = await loadBridgeSettings();
    this.#authentication = this.#settings.token === undefined ? "unpaired" : "pairing";
    this.#notify();
    if (this.#settings.token !== undefined) {
      await this.#connectStoredPairingIfPermitted();
    }
  }

  status(meetingMultiplicity: PublicBridgeStatus["meetingMultiplicity"]): PublicBridgeStatus {
    return {
      authentication: this.#authentication,
      connection: this.#connection,
      meetingMultiplicity,
      paired: this.#settings.token !== undefined,
      port: this.#settings.port,
      ...(this.#problem === undefined ? {} : { problem: this.#problem })
    };
  }

  async pair(code: string): Promise<boolean> {
    if (!isPairingCode(code)) {
      this.#problem = "invalid_pairing_code";
      this.#notify();
      return false;
    }

    this.#permissionCheckGeneration += 1;

    // Pair grants persist the new token atomically. Do not let a second popup
    // action overtake an in-flight durable commit.
    await this.#settingsOperationQueue;

    this.#settlePairWaiter(false);
    this.#pairingGeneration += 1;
    this.#pairingAttempt = {
      binding: undefined,
      challengePending: false,
      clientNonce: createNonce(),
      key: code
    };
    this.#problem = undefined;
    this.#authentication = "pairing";
    this.#suppressReconnect = false;
    const outcome = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        if (this.#pairingAttempt !== undefined) {
          this.#pairingAttempt = undefined;
          this.#authentication = "rejected";
          this.#problem = "bridge_unavailable";
          this.#suppressReconnect = true;
          this.#disconnect(1000, "pairing timeout");
          this.#notify();
        }
        this.#settlePairWaiter(false);
      }, PAIRING_TIMEOUT_MS);
      this.#pairWaiter = { resolve, timer };
    });
    this.#disconnect(1000, "restart pairing");
    this.#connect();
    return outcome;
  }

  async forgetPairing(): Promise<void> {
    this.#permissionCheckGeneration += 1;
    await this.#runSettingsOperation(async () => {
      const candidate: BridgeSettings = { port: this.#settings.port };
      await saveBridgeSettings(candidate);

      this.#settings = candidate;
      this.#pairingGeneration += 1;
      this.#pairingAttempt = undefined;
      this.#authAttempt = undefined;
      this.#session = undefined;
      this.#authentication = "unpaired";
      this.#problem = undefined;
      this.#suppressReconnect = true;
      this.#settlePairWaiter(false);
      this.#disconnect(1000, "pairing removed");
      this.#notify();
    });
  }

  async setPort(port: number): Promise<void> {
    this.#permissionCheckGeneration += 1;
    await this.#runSettingsOperation(async () => {
      if (port === this.#settings.port) {
        return;
      }

      const candidate: BridgeSettings =
        this.#settings.token === undefined ? { port } : { port, token: this.#settings.token };
      await saveBridgeSettings(candidate);

      this.#settings = candidate;
      this.#disconnect(1000, "port changed");
      if (this.#settings.token !== undefined) {
        this.#authentication = "pairing";
        this.#problem = "loopback_permission_required";
        this.#suppressReconnect = true;
      } else {
        this.#authentication = "unpaired";
        this.#problem = undefined;
        this.#suppressReconnect = false;
      }
      this.#notify();
    });
  }

  resumeAfterPermissionGrant(): boolean {
    if (this.#settings.token === undefined) {
      return false;
    }

    this.#permissionCheckGeneration += 1;
    this.#pairingAttempt = undefined;
    this.#authentication = "pairing";
    this.#problem = undefined;
    this.#suppressReconnect = false;
    this.#disconnect(1000, "loopback permission granted");
    this.#connect();
    return true;
  }

  handleLoopbackPermissionRemoval(origins: readonly string[]): void {
    const currentOrigin = loopbackPermissionOrigin(this.#settings.port);
    if (
      this.#settings.token === undefined ||
      currentOrigin === undefined ||
      (!origins.includes(currentOrigin) && !origins.includes("ws://127.0.0.1/*"))
    ) {
      return;
    }

    this.#permissionCheckGeneration += 1;
    this.#pairingAttempt = undefined;
    this.#authentication = "rejected";
    this.#problem = "loopback_permission_required";
    this.#suppressReconnect = true;
    this.#settlePairWaiter(false);
    this.#disconnect(1000, "loopback permission removed");
    this.#notify();
  }

  publishMeetingState(): void {
    const state = this.#options.getMeetingState();
    const serialized = JSON.stringify(state);
    if (serialized === this.#lastPublishedState) {
      return;
    }
    this.#lastPublishedState = serialized;
    this.#queueApplicationMessage(state);
  }

  retryConnection(): void {
    if (
      this.#socket !== undefined ||
      this.#settings.token === undefined ||
      this.#authentication === "rejected" ||
      this.#problem !== "bridge_unavailable"
    ) {
      return;
    }
    this.#suppressReconnect = false;
    this.#clearReconnectTimer();
    void this.#connectStoredPairingIfPermitted();
  }

  async #connectStoredPairingIfPermitted(): Promise<void> {
    const permissionCheckGeneration = ++this.#permissionCheckGeneration;
    const token = this.#settings.token;
    if (token === undefined) {
      if (this.#pairingAttempt !== undefined) {
        this.#connect();
      }
      return;
    }

    const port = this.#settings.port;
    const permission = await getLoopbackPermissionState(port);
    if (
      this.#permissionCheckGeneration !== permissionCheckGeneration ||
      this.#settings.token !== token ||
      this.#settings.port !== port ||
      this.#pairingAttempt !== undefined
    ) {
      return;
    }

    if (permission !== "granted") {
      this.#authentication = "rejected";
      this.#problem = "loopback_permission_required";
      this.#suppressReconnect = true;
      this.#disconnect(1000, "loopback permission required");
      this.#notify();
      return;
    }

    this.#connect();
  }

  #connect(): void {
    if (
      this.#socket !== undefined ||
      (this.#settings.token === undefined && this.#pairingAttempt === undefined)
    ) {
      return;
    }

    this.#clearReconnectTimer();
    this.#connection = "connecting";
    this.#notify();

    let socket: WebSocket;
    try {
      socket = new WebSocket(createBridgeUrl(this.#settings.port), WEB_SOCKET_SUBPROTOCOL);
    } catch (error) {
      this.#connection = "disconnected";
      const loopbackPermissionDenied =
        error instanceof DOMException && error.name === "SecurityError";
      this.#problem = loopbackPermissionDenied
        ? "loopback_permission_denied"
        : "bridge_unavailable";
      if (loopbackPermissionDenied) {
        this.#authentication = "rejected";
        this.#pairingAttempt = undefined;
        this.#suppressReconnect = true;
        this.#settlePairWaiter(false);
      }
      this.#notify();
      if (!loopbackPermissionDenied) {
        this.#scheduleReconnect();
      }
      return;
    }

    socket.binaryType = "arraybuffer";
    this.#socket = socket;
    socket.addEventListener("open", () => {
      if (this.#socket !== socket) {
        return;
      }
      if (socket.protocol !== WEB_SOCKET_SUBPROTOCOL) {
        this.#failProtocol(socket);
        return;
      }

      this.#connection = "connected";
      this.#problem = undefined;
      this.#notify();
      const pairingAttempt = this.#pairingAttempt;
      if (pairingAttempt !== undefined) {
        pairingAttempt.clientNonce = createNonce();
        pairingAttempt.binding = undefined;
        pairingAttempt.challengePending = false;
        this.#sendRaw({
          v: PROTOCOL_VERSION,
          type: "pair.hello",
          clientNonce: pairingAttempt.clientNonce,
          origin: `chrome-extension://${chrome.runtime.id}`,
          role: "extension"
        });
      } else {
        this.#beginAuthentication();
      }
    });
    let receiveQueue = Promise.resolve();
    socket.addEventListener("message", (event: MessageEvent<unknown>) => {
      receiveQueue = receiveQueue
        .then(() => this.#handleFrame(socket, event.data))
        .catch(() => this.#failProtocol(socket));
    });
    socket.addEventListener("close", () => {
      if (this.#socket !== socket) {
        return;
      }
      this.#socket = undefined;
      this.#connection = "disconnected";
      this.#clearSession();
      if (this.#authentication === "authenticated") {
        this.#authentication = "pairing";
      }
      if (this.#problem === undefined && !this.#suppressReconnect) {
        this.#problem = "bridge_unavailable";
      }
      this.#notify();
      if (this.#pairingCommitGeneration === undefined) {
        this.#scheduleReconnect();
      }
    });
  }

  async #handleFrame(socket: WebSocket, data: unknown): Promise<void> {
    if (this.#socket !== socket || typeof data !== "string") {
      this.#failProtocol(socket);
      return;
    }

    const parsed = safeParseProtocolMessage(data);
    if (!parsed.success) {
      this.#failProtocol(socket);
      return;
    }

    const message = parsed.data;
    if (message.type === "pair.challenge") {
      await this.#handlePairingChallenge(socket, message);
      return;
    }
    if (message.type === "pair.granted" || message.type === "pair.rejected") {
      await this.#handlePairingMessage(socket, message);
      return;
    }
    if (message.type === "auth.challenge") {
      await this.#handleAuthChallenge(socket, message);
      return;
    }
    if (message.type === "auth.result") {
      await this.#handleAuthResult(socket, message);
      return;
    }
    if (message.type === "protected") {
      await this.#handleProtectedMessage(socket, message);
      return;
    }

    this.#failProtocol(socket);
  }

  async #handlePairingChallenge(
    socket: WebSocket,
    message: Extract<ProtocolMessage, { type: "pair.challenge" }>
  ): Promise<void> {
    const attempt = this.#pairingAttempt;
    const expectedOrigin = `chrome-extension://${chrome.runtime.id}`;
    if (
      attempt === undefined ||
      attempt.binding !== undefined ||
      attempt.challengePending ||
      message.clientNonce !== attempt.clientNonce ||
      message.origin !== expectedOrigin ||
      message.clientRole !== "extension" ||
      message.serverRole !== "plugin"
    ) {
      this.#failProtocol(socket);
      return;
    }

    const binding: PairingBinding = {
      clientNonce: message.clientNonce,
      serverNonce: message.serverNonce,
      origin: message.origin,
      clientRole: message.clientRole,
      serverRole: message.serverRole
    };
    attempt.challengePending = true;
    const serverIsAuthentic = await verifyHmacSha256TextKey(
      attempt.key,
      encodePairingProofInput(binding, "plugin"),
      message.serverHmac
    );
    if (this.#socket !== socket || this.#pairingAttempt !== attempt) {
      return;
    }
    if (!serverIsAuthentic) {
      this.#rejectPairing(socket, "invalid_pairing_code");
      return;
    }

    attempt.binding = binding;
    attempt.challengePending = false;
    const clientHmac = await hmacSha256TextKey(
      attempt.key,
      encodePairingProofInput(binding, "extension")
    );
    if (
      this.#socket !== socket ||
      this.#pairingAttempt !== attempt ||
      attempt.binding !== binding
    ) {
      return;
    }
    this.#sendRaw({
      v: PROTOCOL_VERSION,
      type: "pair.response",
      ...binding,
      clientHmac
    });
  }

  async #handlePairingMessage(
    socket: WebSocket,
    message: Extract<ProtocolMessage, { type: "pair.granted" | "pair.rejected" }>
  ): Promise<void> {
    const pairingAttempt = this.#pairingAttempt;
    if (this.#socket !== socket || pairingAttempt === undefined) {
      this.#failProtocol(socket);
      return;
    }

    if (message.type === "pair.rejected") {
      this.#pairingAttempt = undefined;
      this.#authentication = "rejected";
      this.#problem = pairingProblem(message);
      this.#suppressReconnect = true;
      this.#settlePairWaiter(false);
      this.#disconnect(1008, "pairing rejected");
      this.#notify();
      return;
    }

    if (pairingAttempt.binding === undefined) {
      this.#failProtocol(socket);
      return;
    }

    // Both peers proved the one-time key. From here the popup must wait for
    // the durable token commit and mutual-auth result; timing out midway would
    // make chrome.storage.local and the live client disagree.
    this.#clearPairingTimeout();
    const generation = this.#pairingGeneration;
    await this.#runSettingsOperation(async () => {
      if (this.#socket !== socket || this.#pairingAttempt !== pairingAttempt) {
        return;
      }
      const settings: BridgeSettings = { port: this.#settings.port, token: message.token };
      this.#pairingCommitGeneration = generation;
      try {
        await saveBridgeSettings(settings);
      } catch {
        if (this.#pairingGeneration === generation) {
          this.#pairingAttempt = undefined;
          this.#authentication = "rejected";
          this.#problem = "bridge_unavailable";
          this.#suppressReconnect = true;
          this.#settlePairWaiter(false);
          this.#disconnect(1011, "pairing storage failed");
          this.#notify();
        }
        throw new Error("Pairing token could not be stored");
      } finally {
        if (this.#pairingCommitGeneration === generation) {
          this.#pairingCommitGeneration = undefined;
        }
      }
      if (this.#pairingGeneration !== generation) {
        return;
      }

      // Persistence is the commit point. Adopt the granted token even if the
      // granting socket closed while chrome.storage.local was pending.
      this.#settings = settings;
      this.#pairingAttempt = undefined;
      this.#authentication = "pairing";
      this.#problem = undefined;
      this.#suppressReconnect = false;
      if (this.#socket === socket && socket.readyState === WebSocket.OPEN) {
        this.#beginAuthentication();
      } else {
        this.#disconnect(1000, "continue committed pairing");
        this.#connect();
        this.#notify();
      }
    });
  }

  #rejectPairing(socket: WebSocket, problem: BridgeProblem): void {
    if (this.#socket !== socket) {
      return;
    }
    this.#pairingAttempt = undefined;
    this.#authentication = "rejected";
    this.#problem = problem;
    this.#suppressReconnect = true;
    this.#settlePairWaiter(false);
    this.#disconnect(1008, "pairing authentication failed");
    this.#notify();
  }

  #beginAuthentication(): void {
    const token = this.#settings.token;
    if (token === undefined || this.#socket?.readyState !== WebSocket.OPEN) {
      this.#failAuthentication();
      return;
    }

    const clientNonce = createNonce();
    const origin = `chrome-extension://${chrome.runtime.id}`;
    this.#authAttempt = { clientNonce, token };
    this.#armAuthenticationTimeout();
    const hello: AuthHelloMessage = {
      v: PROTOCOL_VERSION,
      type: "auth.hello",
      clientNonce,
      origin,
      role: "extension"
    };
    this.#sendRaw(hello);
  }

  async #handleAuthChallenge(socket: WebSocket, message: AuthChallengeMessage): Promise<void> {
    const attempt = this.#authAttempt;
    const expectedOrigin = `chrome-extension://${chrome.runtime.id}`;
    if (
      attempt === undefined ||
      attempt.binding !== undefined ||
      message.clientNonce !== attempt.clientNonce ||
      message.origin !== expectedOrigin ||
      message.clientRole !== "extension" ||
      message.serverRole !== "plugin"
    ) {
      this.#failAuthentication();
      return;
    }

    const binding: AuthBinding = {
      session: message.session,
      clientNonce: message.clientNonce,
      serverNonce: message.serverNonce,
      origin: message.origin,
      clientRole: message.clientRole,
      serverRole: message.serverRole
    };
    attempt.binding = binding;
    const hmac = await hmacSha256Bytes(attempt.token, encodeAuthProofInput(binding, "extension"));
    if (this.#socket !== socket || this.#authAttempt !== attempt || attempt.binding !== binding) {
      return;
    }
    this.#sendRaw({
      v: PROTOCOL_VERSION,
      type: "auth.response",
      ...binding,
      hmac
    });
    this.#armAuthenticationTimeout();
  }

  async #handleAuthResult(
    socket: WebSocket,
    message: Extract<ProtocolMessage, { type: "auth.result" }>
  ): Promise<void> {
    const attempt = this.#authAttempt;
    const binding = attempt?.binding;
    if (
      attempt === undefined ||
      binding === undefined ||
      message.session !== binding.session ||
      message.status !== "ok"
    ) {
      this.#failAuthentication();
      return;
    }

    const serverIsAuthentic = await verifyHmacSha256(
      attempt.token,
      encodeAuthProofInput(binding, "plugin"),
      message.serverHmac
    );
    if (this.#socket !== socket || this.#authAttempt !== attempt || attempt.binding !== binding) {
      return;
    }
    if (!serverIsAuthentic) {
      this.#failAuthentication();
      return;
    }

    const salt = encodeSessionKeySalt(binding);
    const [outboundKey, inboundKey] = await Promise.all([
      deriveSessionHmacKey(
        attempt.token,
        salt,
        encodeSessionKeyInfo(binding, "extension_to_plugin")
      ),
      deriveSessionHmacKey(
        attempt.token,
        salt,
        encodeSessionKeyInfo(binding, "plugin_to_extension")
      )
    ]);
    if (this.#socket !== socket || this.#authAttempt !== attempt || attempt.binding !== binding) {
      return;
    }
    this.#session = {
      binding,
      inboundKey,
      outboundKey,
      outboundSequence: 0,
      replayGuard: new ProtectedMessageReplayGuard()
    };
    this.#clearAuthenticationTimer();
    this.#authAttempt = undefined;
    this.#authentication = "authenticated";
    this.#reconnectAttempt = 0;
    this.#problem = undefined;
    this.#suppressReconnect = false;
    this.#lastPublishedState = "";
    this.#startKeepalive();
    this.#notify();
    this.#settlePairWaiter(true);
    this.publishMeetingState();
  }

  async #handleProtectedMessage(socket: WebSocket, frame: ProtectedMessage): Promise<void> {
    const session = this.#session;
    if (session === undefined || frame.session !== session.binding.session) {
      this.#failAuthentication();
      return;
    }
    const macIsValid = await verifyWithKey(
      session.inboundKey,
      encodeProtectedMessageMacInput(frame),
      frame.mac
    );
    if (this.#socket !== socket || this.#session !== session) {
      return;
    }
    if (
      frame.direction !== "plugin_to_extension" ||
      !macIsValid ||
      !session.replayGuard.acceptAuthenticated(frame)
    ) {
      this.#failAuthentication();
      return;
    }

    const message = frame.message;
    if (message.type === "ping") {
      this.#queueApplicationMessage({ v: PROTOCOL_VERSION, type: "pong", nonce: message.nonce });
      return;
    }
    if (message.type === "pong") {
      this.#pendingPings.delete(message.nonce);
      return;
    }
    if (message.type !== "command") {
      this.#failProtocol(this.#socket);
      return;
    }

    const cached = this.#commandResults.get(message.id);
    if (cached !== undefined) {
      this.#queueApplicationMessage(cached);
      return;
    }

    if (this.#inFlightCommands.has(message.id)) {
      return;
    }

    const execution = this.#options.onCommand(message);
    this.#inFlightCommands.set(message.id, execution);
    void this.#completeCommand(socket, session, message.id, execution);
  }

  async #completeCommand(
    socket: WebSocket,
    session: AuthenticatedSession,
    id: string,
    execution: Promise<ResultMessage>
  ): Promise<void> {
    let result: ResultMessage;
    try {
      result = await execution;
    } catch {
      result = { v: PROTOCOL_VERSION, type: "result", id, status: "timeout" };
    }
    if (this.#inFlightCommands.get(id) === execution) {
      this.#inFlightCommands.delete(id);
    }
    if (this.#socket !== socket || this.#session !== session) {
      return;
    }

    this.#commandResults.set(id, result);
    if (this.#commandResults.size > 128) {
      const oldest = this.#commandResults.keys().next().value;
      if (oldest !== undefined) {
        this.#commandResults.delete(oldest);
      }
    }
    this.#queueApplicationMessage(result);
  }

  #queueApplicationMessage(message: ApplicationMessage): void {
    const session = this.#session;
    const socket = this.#socket;
    if (session === undefined || socket === undefined) {
      return;
    }

    this.#outboundQueue = this.#outboundQueue
      .then(async () => {
        if (
          this.#session !== session ||
          this.#socket !== socket ||
          socket.readyState !== WebSocket.OPEN
        ) {
          return;
        }

        session.outboundSequence += 1;
        const input: ProtectedMacInput = {
          v: PROTOCOL_VERSION,
          type: "protected",
          session: session.binding.session,
          direction: "extension_to_plugin",
          seq: session.outboundSequence,
          message
        };
        const mac = await signWithKey(session.outboundKey, encodeProtectedMessageMacInput(input));
        if (this.#session !== session || this.#socket !== socket) {
          return;
        }
        this.#sendRaw({ ...input, mac });
      })
      .catch(() => {
        if (this.#session === session && this.#socket === socket) {
          this.#failProtocol(socket);
        }
      });
  }

  #sendRaw(message: ProtocolMessage): void {
    const socket = this.#socket;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      socket.send(serializeProtocolMessage(message));
    } catch {
      this.#failProtocol(socket);
    }
  }

  #startKeepalive(): void {
    this.#clearKeepalive();
    this.#keepaliveTimer = setInterval(() => {
      const now = Date.now();
      if (
        Array.from(this.#pendingPings.values()).some(
          (sentAt) => now - sentAt > KEEPALIVE_TIMEOUT_MS
        )
      ) {
        this.#reconnectAfterTransportFailure(1001, "heartbeat timeout");
        return;
      }

      const nonce = createNonce();
      this.#pendingPings.set(nonce, now);
      this.#queueApplicationMessage({ v: PROTOCOL_VERSION, type: "ping", nonce });
    }, KEEPALIVE_INTERVAL_MS);
  }

  #clearSession(): void {
    this.#clearKeepalive();
    this.#clearAuthenticationTimer();
    this.#authAttempt = undefined;
    this.#session = undefined;
    // A pending WebCrypto operation from an old session must neither block
    // nor affect the outbound queue of its replacement session.
    this.#outboundQueue = Promise.resolve();
    this.#pendingPings.clear();
    this.#commandResults.clear();
    this.#inFlightCommands.clear();
  }

  #clearKeepalive(): void {
    if (this.#keepaliveTimer !== undefined) {
      clearInterval(this.#keepaliveTimer);
      this.#keepaliveTimer = undefined;
    }
  }

  #armAuthenticationTimeout(): void {
    this.#clearAuthenticationTimer();
    this.#authenticationTimer = setTimeout(() => {
      this.#authenticationTimer = undefined;
      this.#failAuthentication();
    }, AUTHENTICATION_TIMEOUT_MS);
  }

  #clearAuthenticationTimer(): void {
    if (this.#authenticationTimer !== undefined) {
      clearTimeout(this.#authenticationTimer);
      this.#authenticationTimer = undefined;
    }
  }

  #failAuthentication(): void {
    this.#authentication = "rejected";
    this.#problem = "authentication_failed";
    this.#suppressReconnect = true;
    this.#settlePairWaiter(false);
    this.#disconnect(1008, "authentication failed");
    this.#notify();
  }

  #failProtocol(socket: WebSocket | undefined): void {
    if (socket === undefined || this.#socket !== socket) {
      return;
    }
    this.#pairingAttempt = undefined;
    this.#authentication = "rejected";
    this.#problem = "protocol_error";
    this.#suppressReconnect = true;
    this.#settlePairWaiter(false);
    this.#disconnect(1002, "protocol error");
    this.#notify();
  }

  #disconnect(code: number, reason: string): void {
    this.#clearReconnectTimer();
    this.#clearSession();
    const socket = this.#socket;
    this.#socket = undefined;
    this.#connection = "disconnected";
    if (socket !== undefined && socket.readyState < WebSocket.CLOSING) {
      socket.close(code, reason);
    }
  }

  #reconnectAfterTransportFailure(code: number, reason: string): void {
    this.#authentication = this.#settings.token === undefined ? "unpaired" : "pairing";
    this.#problem = "bridge_unavailable";
    this.#suppressReconnect = false;
    this.#disconnect(code, reason);
    this.#notify();
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (
      this.#suppressReconnect ||
      this.#reconnectTimer !== undefined ||
      (this.#settings.token === undefined && this.#pairingAttempt === undefined)
    ) {
      return;
    }

    const delay = backoffDelay(this.#reconnectAttempt);
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.#connectStoredPairingIfPermitted();
    }, delay);
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer !== undefined) {
      clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = undefined;
    }
  }

  #runSettingsOperation(operation: () => Promise<void>): Promise<void> {
    const result = this.#settingsOperationQueue.then(operation);
    this.#settingsOperationQueue = result.catch(() => undefined);
    return result;
  }

  #settlePairWaiter(success: boolean): void {
    const waiter = this.#pairWaiter;
    if (waiter === undefined) {
      return;
    }
    this.#pairWaiter = undefined;
    clearTimeout(waiter.timer);
    waiter.resolve(success);
  }

  #clearPairingTimeout(): void {
    if (this.#pairWaiter !== undefined) {
      clearTimeout(this.#pairWaiter.timer);
    }
  }

  #notify(): void {
    this.#options.onStatusChange();
  }
}

export function createBridgeUrl(port: number): string {
  return `ws://127.0.0.1:${port}/v1`;
}

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 500 * 2 ** Math.min(attempt, 6));
  const jitter = 0.75 + random() * 0.5;
  return Math.min(MAX_BACKOFF_MS, Math.round(base * jitter));
}

function pairingProblem(message: PairRejectedMessage): BridgeProblem {
  switch (message.reason) {
    case "invalid_code":
      return "invalid_pairing_code";
    case "expired_code":
      return "pairing_expired";
    case "pairing_closed":
    case "rate_limited":
      return "bridge_unavailable";
  }
}
