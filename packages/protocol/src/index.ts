/** The only protocol version understood by this package. */
export const PROTOCOL_VERSION = 1 as const;

/** Maximum UTF-8 encoded WebSocket message size accepted by the protocol. */
export const MAX_MESSAGE_BYTES = 16 * 1024;

export const COMMAND_ACTIONS = [
  "microphone.set",
  "camera.set",
  "hand.set",
  "presentation.start",
  "presentation.stop",
  "meet.focus"
] as const;

export const RESULT_STATUSES = [
  "ok",
  "noop",
  "no_meeting",
  "ambiguous_target",
  "unsupported_ui",
  "blocked",
  "timeout",
  "needs_user_action"
] as const;

export const MEETING_MULTIPLICITIES = ["none", "one", "multiple"] as const;
export const TRANSPORT_DIRECTIONS = ["extension_to_plugin", "plugin_to_extension"] as const;

export const PAIR_REJECTION_REASONS = [
  "invalid_code",
  "expired_code",
  "rate_limited",
  "pairing_closed"
] as const;

export const AUTH_RESULT_STATUSES = ["ok", "invalid"] as const;
export const AUTH_ROLES = ["extension", "plugin"] as const;

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type CommandAction = (typeof COMMAND_ACTIONS)[number];
export type SetCommandAction = Extract<CommandAction, "microphone.set" | "camera.set" | "hand.set">;
export type ImmediateCommandAction = Exclude<CommandAction, SetCommandAction>;
export type ResultStatus = (typeof RESULT_STATUSES)[number];
export type MeetingMultiplicity = (typeof MEETING_MULTIPLICITIES)[number];
export type TransportDirection = (typeof TRANSPORT_DIRECTIONS)[number];
export type PairRejectionReason = (typeof PAIR_REJECTION_REASONS)[number];
export type AuthResultStatus = (typeof AUTH_RESULT_STATUSES)[number];
export type AuthRole = (typeof AUTH_ROLES)[number];

export type ToggleState = "on" | "off" | "unknown";
export type HandState = "raised" | "lowered" | "unknown";
export type SelfPresentationState = "active" | "inactive" | "unknown";
export type FrameInput = string | Uint8Array | ArrayBuffer;

interface MessageBase<TType extends string> {
  readonly v: ProtocolVersion;
  readonly type: TType;
}

export type CommandMessage =
  | (MessageBase<"command"> & {
      readonly id: string;
      readonly action: SetCommandAction;
      readonly value: boolean;
    })
  | (MessageBase<"command"> & {
      readonly id: string;
      readonly action: ImmediateCommandAction;
    });

/** Privacy-minimised state: it intentionally contains no meeting metadata. */
export interface MeetingStateMessage extends MessageBase<"state"> {
  readonly meetingMultiplicity: MeetingMultiplicity;
  readonly microphone: ToggleState;
  readonly camera: ToggleState;
  readonly hand: HandState;
  readonly selfPresentation: SelfPresentationState;
}

export interface ResultMessage extends MessageBase<"result"> {
  /** Correlates this result with a CommandMessage. */
  readonly id: string;
  readonly status: ResultStatus;
}

export interface PingMessage extends MessageBase<"ping"> {
  /** An opaque correlation nonce (base64url, 16-128 characters). */
  readonly nonce: string;
}

export interface PongMessage extends MessageBase<"pong"> {
  /** Must be copied verbatim from the corresponding PingMessage. */
  readonly nonce: string;
}

/** Messages that are valid only inside a ProtectedMessage envelope. */
export type ApplicationMessage =
  CommandMessage | MeetingStateMessage | ResultMessage | PingMessage | PongMessage;

export interface PairRequestMessage extends MessageBase<"pair.request"> {
  /** Exactly eight ASCII decimal digits, including possible leading zeroes. */
  readonly code: string;
}

export interface PairGrantedMessage extends MessageBase<"pair.granted"> {
  /** A 256-bit random token encoded as unpadded base64url. */
  readonly token: string;
}

export interface PairRejectedMessage extends MessageBase<"pair.rejected"> {
  readonly reason: PairRejectionReason;
}

export type PairingMessage = PairRequestMessage | PairGrantedMessage | PairRejectedMessage;

/**
 * Values cryptographically bound into both authentication proofs and both
 * direction-separated session keys.
 */
export interface AuthBinding {
  /** Random 256-bit connection-session id; never a Meet id or URL. */
  readonly session: string;
  /** 256 random bits, unpadded base64url. */
  readonly clientNonce: string;
  /** 256 random bits, unpadded base64url. */
  readonly serverNonce: string;
  /** The exact pinned Chrome extension origin. */
  readonly origin: string;
  readonly clientRole: "extension";
  readonly serverRole: "plugin";
}

export interface AuthHelloMessage extends MessageBase<"auth.hello"> {
  readonly clientNonce: string;
  readonly origin: string;
  readonly role: "extension";
}

export interface AuthChallengeMessage extends MessageBase<"auth.challenge">, AuthBinding {}

export interface AuthResponseMessage extends MessageBase<"auth.response">, AuthBinding {
  /** Client proof: HMAC-SHA-256 over encodeAuthProofInput(binding, "extension"). */
  readonly hmac: string;
}

export type AuthResultMessage =
  | (MessageBase<"auth.result"> & {
      readonly session: string;
      readonly status: "ok";
      /** Server proof over the same binding with the "plugin" role. */
      readonly serverHmac: string;
    })
  | (MessageBase<"auth.result"> & {
      readonly session: string;
      readonly status: "invalid";
    });

export type AuthMessage =
  AuthHelloMessage | AuthChallengeMessage | AuthResponseMessage | AuthResultMessage;

export interface ProtectedMacInput extends MessageBase<"protected"> {
  /** The random opaque connection-session id from AuthBinding. */
  readonly session: string;
  readonly direction: TransportDirection;
  /** Strictly increasing per session and direction, starting at one. */
  readonly seq: number;
  readonly message: ApplicationMessage;
}

export interface ProtectedMessage extends ProtectedMacInput {
  /** HMAC-SHA-256 over encodeProtectedMessageMacInput(frame), base64url. */
  readonly mac: string;
}

/** Every post-authentication application frame is a ProtectedMessage. */
export type ProtocolMessage = PairingMessage | AuthMessage | ProtectedMessage;

export type ProtocolValidationErrorCode =
  "too_large" | "invalid_encoding" | "invalid_json" | "invalid_message";

export class ProtocolValidationError extends Error {
  readonly code: ProtocolValidationErrorCode;

  constructor(code: ProtocolValidationErrorCode, message: string) {
    super(message);
    this.name = "ProtocolValidationError";
    this.code = code;
  }
}

export type ParseResult =
  | { readonly success: true; readonly data: ProtocolMessage }
  | { readonly success: false; readonly error: ProtocolValidationError };

type UnknownRecord = Record<string, unknown>;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const wireIdentifierPattern = /^[A-Za-z0-9._:-]+$/;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const pairingCodePattern = /^\d{8}$/;
const chromeExtensionOriginPattern = /^chrome-extension:\/\/[a-p]{32}$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.length === keys.length &&
    ownKeys.every((key) => typeof key === "string" && keys.includes(key))
  );
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function isWireIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    wireIdentifierPattern.test(value)
  );
}

function isSessionIdentifier(value: unknown): value is string {
  return isBase64Url256(value);
}

function isBase64UrlWithLength(
  value: unknown,
  minimumLength: number,
  maximumLength: number
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    base64UrlPattern.test(value)
  );
}

function isBase64Url256(value: unknown): value is string {
  // 32 bytes encode to 42 arbitrary base64url characters followed by one
  // character carrying four data bits and two zero padding bits. Its alphabet
  // index must therefore be one of the 16 multiples of four.
  return typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

function isChromeExtensionOrigin(value: unknown): value is string {
  return typeof value === "string" && chromeExtensionOriginPattern.test(value);
}

function isSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function hasValidBase(value: UnknownRecord, type: string): boolean {
  return value.v === PROTOCOL_VERSION && value.type === type;
}

function hasValidAuthBindingFields(value: UnknownRecord): boolean {
  return (
    isSessionIdentifier(value.session) &&
    isBase64Url256(value.clientNonce) &&
    isBase64Url256(value.serverNonce) &&
    isChromeExtensionOrigin(value.origin) &&
    value.clientRole === "extension" &&
    value.serverRole === "plugin"
  );
}

function directionAllowsMessage(
  direction: TransportDirection,
  message: ApplicationMessage
): boolean {
  if (message.type === "command") {
    return direction === "plugin_to_extension";
  }
  if (message.type === "state" || message.type === "result") {
    return direction === "extension_to_plugin";
  }
  return true;
}

export function isPairingCode(value: unknown): value is string {
  return typeof value === "string" && pairingCodePattern.test(value);
}

export function isCommandMessage(value: unknown): value is CommandMessage {
  if (!isRecord(value) || !hasValidBase(value, "command")) {
    return false;
  }

  if (!isWireIdentifier(value.id) || !isOneOf(value.action, COMMAND_ACTIONS)) {
    return false;
  }

  if (
    value.action === "microphone.set" ||
    value.action === "camera.set" ||
    value.action === "hand.set"
  ) {
    return (
      hasExactKeys(value, ["v", "type", "id", "action", "value"]) &&
      typeof value.value === "boolean"
    );
  }

  return hasExactKeys(value, ["v", "type", "id", "action"]);
}

export function isMeetingStateMessage(value: unknown): value is MeetingStateMessage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "v",
      "type",
      "meetingMultiplicity",
      "microphone",
      "camera",
      "hand",
      "selfPresentation"
    ]) ||
    !hasValidBase(value, "state")
  ) {
    return false;
  }

  return (
    isOneOf(value.meetingMultiplicity, MEETING_MULTIPLICITIES) &&
    isOneOf(value.microphone, ["on", "off", "unknown"] as const) &&
    isOneOf(value.camera, ["on", "off", "unknown"] as const) &&
    isOneOf(value.hand, ["raised", "lowered", "unknown"] as const) &&
    isOneOf(value.selfPresentation, ["active", "inactive", "unknown"] as const)
  );
}

export function isResultMessage(value: unknown): value is ResultMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["v", "type", "id", "status"]) &&
    hasValidBase(value, "result") &&
    isWireIdentifier(value.id) &&
    isOneOf(value.status, RESULT_STATUSES)
  );
}

export function isHeartbeatMessage(value: unknown): value is PingMessage | PongMessage {
  if (!isRecord(value) || (value.type !== "ping" && value.type !== "pong")) {
    return false;
  }

  return (
    hasExactKeys(value, ["v", "type", "nonce"]) &&
    hasValidBase(value, value.type) &&
    isBase64UrlWithLength(value.nonce, 16, 128)
  );
}

export function isApplicationMessage(value: unknown): value is ApplicationMessage {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "command":
      return isCommandMessage(value);
    case "state":
      return isMeetingStateMessage(value);
    case "result":
      return isResultMessage(value);
    case "ping":
    case "pong":
      return isHeartbeatMessage(value);
    default:
      return false;
  }
}

export function isPairingMessage(value: unknown): value is PairingMessage {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "pair.request":
      return (
        hasExactKeys(value, ["v", "type", "code"]) &&
        hasValidBase(value, "pair.request") &&
        isPairingCode(value.code)
      );
    case "pair.granted":
      return (
        hasExactKeys(value, ["v", "type", "token"]) &&
        hasValidBase(value, "pair.granted") &&
        isBase64Url256(value.token)
      );
    case "pair.rejected":
      return (
        hasExactKeys(value, ["v", "type", "reason"]) &&
        hasValidBase(value, "pair.rejected") &&
        isOneOf(value.reason, PAIR_REJECTION_REASONS)
      );
    default:
      return false;
  }
}

export function isAuthBinding(value: unknown): value is AuthBinding {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "session",
      "clientNonce",
      "serverNonce",
      "origin",
      "clientRole",
      "serverRole"
    ]) &&
    hasValidAuthBindingFields(value)
  );
}

export function isAuthMessage(value: unknown): value is AuthMessage {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "auth.hello":
      return (
        hasExactKeys(value, ["v", "type", "clientNonce", "origin", "role"]) &&
        hasValidBase(value, "auth.hello") &&
        isBase64Url256(value.clientNonce) &&
        isChromeExtensionOrigin(value.origin) &&
        value.role === "extension"
      );
    case "auth.challenge":
      return (
        hasExactKeys(value, [
          "v",
          "type",
          "session",
          "clientNonce",
          "serverNonce",
          "origin",
          "clientRole",
          "serverRole"
        ]) &&
        hasValidBase(value, "auth.challenge") &&
        hasValidAuthBindingFields(value)
      );
    case "auth.response":
      return (
        hasExactKeys(value, [
          "v",
          "type",
          "session",
          "clientNonce",
          "serverNonce",
          "origin",
          "clientRole",
          "serverRole",
          "hmac"
        ]) &&
        hasValidBase(value, "auth.response") &&
        hasValidAuthBindingFields(value) &&
        isBase64Url256(value.hmac)
      );
    case "auth.result":
      if (!hasValidBase(value, "auth.result") || !isSessionIdentifier(value.session)) {
        return false;
      }
      if (value.status === "ok") {
        return (
          hasExactKeys(value, ["v", "type", "session", "status", "serverHmac"]) &&
          isBase64Url256(value.serverHmac)
        );
      }
      return value.status === "invalid" && hasExactKeys(value, ["v", "type", "session", "status"]);
    default:
      return false;
  }
}

export function isProtectedMacInput(value: unknown): value is ProtectedMacInput {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["v", "type", "session", "direction", "seq", "message"]) ||
    !hasValidBase(value, "protected") ||
    !isSessionIdentifier(value.session) ||
    !isOneOf(value.direction, TRANSPORT_DIRECTIONS) ||
    !isSequence(value.seq) ||
    !isApplicationMessage(value.message)
  ) {
    return false;
  }

  return directionAllowsMessage(value.direction, value.message);
}

export function isProtectedMessage(value: unknown): value is ProtectedMessage {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["v", "type", "session", "direction", "seq", "message", "mac"]) ||
    !isBase64Url256(value.mac)
  ) {
    return false;
  }

  const input: ProtectedMacInput = {
    v: value.v as ProtocolVersion,
    type: value.type as "protected",
    session: value.session as string,
    direction: value.direction as TransportDirection,
    seq: value.seq as number,
    message: value.message as ApplicationMessage
  };
  return isProtectedMacInput(input);
}

export function isProtocolMessage(value: unknown): value is ProtocolMessage {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case "pair.request":
    case "pair.granted":
    case "pair.rejected":
      return isPairingMessage(value);
    case "auth.hello":
    case "auth.challenge":
    case "auth.response":
    case "auth.result":
      return isAuthMessage(value);
    case "protected":
      return isProtectedMessage(value);
    default:
      return false;
  }
}

function canonicalApplicationTuple(message: ApplicationMessage): readonly unknown[] {
  switch (message.type) {
    case "command":
      if (
        message.action === "microphone.set" ||
        message.action === "camera.set" ||
        message.action === "hand.set"
      ) {
        return [message.v, message.type, message.id, message.action, message.value];
      }
      return [message.v, message.type, message.id, message.action];
    case "state":
      return [
        message.v,
        message.type,
        message.meetingMultiplicity,
        message.microphone,
        message.camera,
        message.hand,
        message.selfPresentation
      ];
    case "result":
      return [message.v, message.type, message.id, message.status];
    case "ping":
    case "pong":
      return [message.v, message.type, message.nonce];
  }
}

function assertAuthBinding(binding: AuthBinding): void {
  // AuthChallengeMessage and AuthResponseMessage structurally extend
  // AuthBinding. Canonicalisation accepts those supersets and selects only the
  // six explicitly bound fields.
  if (!isRecord(binding) || !hasValidAuthBindingFields(binding)) {
    throw new ProtocolValidationError(
      "invalid_message",
      "Value does not match an authentication binding."
    );
  }
}

function assertAuthRole(role: AuthRole): void {
  if (!isOneOf(role, AUTH_ROLES)) {
    throw new ProtocolValidationError("invalid_message", "Authentication proof role is invalid.");
  }
}

/** Stable, interoperable input for the client and server authentication proofs. */
export function canonicalizeAuthProofInput(binding: AuthBinding, prover: AuthRole): string {
  assertAuthBinding(binding);
  assertAuthRole(prover);
  return JSON.stringify([
    "meet-deck/auth-proof/v1",
    prover,
    binding.session,
    binding.clientNonce,
    binding.serverNonce,
    binding.origin,
    binding.clientRole,
    binding.serverRole
  ]);
}

export function encodeAuthProofInput(binding: AuthBinding, prover: AuthRole): Uint8Array {
  return utf8Encoder.encode(canonicalizeAuthProofInput(binding, prover));
}

/**
 * Stable HKDF-SHA-256 salt. Use these exact UTF-8 bytes directly as the HKDF
 * salt; do not hash, concatenate, or otherwise transform them first.
 */
export function canonicalizeSessionKeySalt(binding: AuthBinding): string {
  assertAuthBinding(binding);
  return JSON.stringify([
    "meet-deck/session-salt/v1",
    binding.session,
    binding.clientNonce,
    binding.serverNonce
  ]);
}

export function encodeSessionKeySalt(binding: AuthBinding): Uint8Array {
  return utf8Encoder.encode(canonicalizeSessionKeySalt(binding));
}

/**
 * Stable HKDF-SHA-256 info. Derive one independent key for each direction;
 * callers retain the pairing token as IKM and never put it in this input.
 */
export function canonicalizeSessionKeyInfo(
  binding: AuthBinding,
  direction: TransportDirection
): string {
  assertAuthBinding(binding);
  if (!isOneOf(direction, TRANSPORT_DIRECTIONS)) {
    throw new ProtocolValidationError("invalid_message", "Transport direction is invalid.");
  }
  return JSON.stringify([
    "meet-deck/session-key/v1",
    direction,
    binding.session,
    binding.clientNonce,
    binding.serverNonce,
    binding.origin,
    binding.clientRole,
    binding.serverRole
  ]);
}

export function encodeSessionKeyInfo(
  binding: AuthBinding,
  direction: TransportDirection
): Uint8Array {
  return utf8Encoder.encode(canonicalizeSessionKeyInfo(binding, direction));
}

/** Stable UTF-8 MAC input for a protected application frame. */
export function canonicalizeProtectedMessageMacInput(
  frame: ProtectedMacInput | ProtectedMessage
): string {
  if (!isProtectedMacInput(frame) && !isProtectedMessage(frame)) {
    throw new ProtocolValidationError(
      "invalid_message",
      "Value does not match a protected frame MAC input."
    );
  }
  return JSON.stringify([
    "meet-deck/protected-frame/v1",
    frame.v,
    frame.session,
    frame.direction,
    frame.seq,
    canonicalApplicationTuple(frame.message)
  ]);
}

export function encodeProtectedMessageMacInput(
  frame: ProtectedMacInput | ProtectedMessage
): Uint8Array {
  return utf8Encoder.encode(canonicalizeProtectedMessageMacInput(frame));
}

export function isNewerSequence(
  sequence: number,
  highestAcceptedSequence: number | undefined
): boolean {
  if (!isSequence(sequence)) {
    return false;
  }
  return highestAcceptedSequence === undefined || sequence > highestAcceptedSequence;
}

/**
 * Stateful replay guard. Call `acceptAuthenticated` only after verifying the
 * frame MAC with the key for its declared direction.
 */
export class ProtectedMessageReplayGuard {
  readonly #highestByStream = new Map<string, number>();

  acceptAuthenticated(message: ProtectedMessage): boolean {
    if (!isProtectedMessage(message)) {
      return false;
    }
    const key = `${message.session}\0${message.direction}`;
    const highest = this.#highestByStream.get(key);
    if (!isNewerSequence(message.seq, highest)) {
      return false;
    }
    this.#highestByStream.set(key, message.seq);
    return true;
  }

  highestAccepted(session: string, direction: TransportDirection): number | undefined {
    if (!isSessionIdentifier(session) || !isOneOf(direction, TRANSPORT_DIRECTIONS)) {
      return undefined;
    }
    return this.#highestByStream.get(`${session}\0${direction}`);
  }

  resetSession(session: string): void {
    if (!isSessionIdentifier(session)) {
      return;
    }
    for (const direction of TRANSPORT_DIRECTIONS) {
      this.#highestByStream.delete(`${session}\0${direction}`);
    }
  }

  clear(): void {
    this.#highestByStream.clear();
  }
}

function decodeFrame(input: FrameInput): string {
  if (typeof input === "string") {
    if (utf8Encoder.encode(input).byteLength > MAX_MESSAGE_BYTES) {
      throw new ProtocolValidationError(
        "too_large",
        `Protocol messages may not exceed ${MAX_MESSAGE_BYTES} bytes.`
      );
    }
    return input;
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > MAX_MESSAGE_BYTES) {
    throw new ProtocolValidationError(
      "too_large",
      `Protocol messages may not exceed ${MAX_MESSAGE_BYTES} bytes.`
    );
  }

  try {
    return utf8Decoder.decode(bytes);
  } catch {
    throw new ProtocolValidationError(
      "invalid_encoding",
      "Protocol messages must contain valid UTF-8."
    );
  }
}

export function parseProtocolMessage(input: FrameInput): ProtocolMessage {
  const text = decodeFrame(input);
  let value: unknown;

  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new ProtocolValidationError("invalid_json", "Protocol messages must contain valid JSON.");
  }

  if (!isProtocolMessage(value)) {
    throw new ProtocolValidationError(
      "invalid_message",
      "JSON does not match the Meet Deck protocol v1."
    );
  }

  return value;
}

export function safeParseProtocolMessage(input: FrameInput): ParseResult {
  try {
    return { success: true, data: parseProtocolMessage(input) };
  } catch (error) {
    if (error instanceof ProtocolValidationError) {
      return { success: false, error };
    }
    return {
      success: false,
      error: new ProtocolValidationError(
        "invalid_message",
        "The protocol message could not be processed."
      )
    };
  }
}

export function serializeProtocolMessage(message: ProtocolMessage): string {
  if (!isProtocolMessage(message)) {
    throw new ProtocolValidationError(
      "invalid_message",
      "Value does not match the Meet Deck protocol v1."
    );
  }

  const encoded = JSON.stringify(message);
  if (utf8Encoder.encode(encoded).byteLength > MAX_MESSAGE_BYTES) {
    throw new ProtocolValidationError(
      "too_large",
      `Protocol messages may not exceed ${MAX_MESSAGE_BYTES} bytes.`
    );
  }
  return encoded;
}
