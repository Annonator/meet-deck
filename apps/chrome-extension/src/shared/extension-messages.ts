export const DEFAULT_BRIDGE_PORT = 53_421;
export const MIN_BRIDGE_PORT = 1_024;
export const MAX_BRIDGE_PORT = 65_535;

export type BridgeConnection = "connected" | "connecting" | "disconnected";
export type BridgeAuthentication = "authenticated" | "pairing" | "rejected" | "unpaired";
export type MeetingMultiplicity = "multiple" | "none" | "one";

export interface PublicBridgeStatus {
  readonly authentication: BridgeAuthentication;
  readonly connection: BridgeConnection;
  readonly meetingMultiplicity: MeetingMultiplicity;
  readonly paired: boolean;
  readonly port: number;
  readonly problem?: BridgeProblem;
}

export type BridgeProblem =
  | "authentication_failed"
  | "bridge_unavailable"
  | "invalid_pairing_code"
  | "loopback_permission_denied"
  | "loopback_permission_required"
  | "pairing_expired"
  | "protocol_error";

export type ExtensionError =
  BridgeProblem | "not_paired" | "request_failed" | "secure_storage_unavailable";

export type ExtensionRequest =
  | { readonly kind: "bridge.connect" }
  | { readonly kind: "bridge.status.get" }
  | { readonly kind: "bridge.pair"; readonly code: string }
  | { readonly kind: "bridge.pair.forget" }
  | { readonly kind: "bridge.port.set"; readonly port: number };

export type ExtensionResponse =
  | { readonly ok: true; readonly status: PublicBridgeStatus }
  | { readonly error: ExtensionError; readonly ok: false; readonly status: PublicBridgeStatus };

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  switch (value.kind) {
    case "bridge.connect":
    case "bridge.status.get":
    case "bridge.pair.forget":
      return Object.keys(value).length === 1;
    case "bridge.pair":
      return Object.keys(value).length === 2 && typeof value.code === "string";
    case "bridge.port.set":
      return Object.keys(value).length === 2 && isBridgePort(value.port);
    default:
      return false;
  }
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (!isRecord(value) || typeof value.ok !== "boolean" || !isPublicBridgeStatus(value.status)) {
    return false;
  }

  return value.ok || isExtensionError(value.error);
}

export function isPublicBridgeStatus(value: unknown): value is PublicBridgeStatus {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);
  if (
    keys.some(
      (key) =>
        ![
          "authentication",
          "connection",
          "meetingMultiplicity",
          "paired",
          "port",
          "problem"
        ].includes(key)
    )
  ) {
    return false;
  }

  return (
    isOneOfString(value.authentication, ["authenticated", "pairing", "rejected", "unpaired"]) &&
    isOneOfString(value.connection, ["connected", "connecting", "disconnected"]) &&
    isOneOfString(value.meetingMultiplicity, ["multiple", "none", "one"]) &&
    typeof value.paired === "boolean" &&
    isBridgePort(value.port) &&
    (value.problem === undefined ||
      isOneOfString(value.problem, [
        "authentication_failed",
        "bridge_unavailable",
        "invalid_pairing_code",
        "loopback_permission_denied",
        "loopback_permission_required",
        "pairing_expired",
        "protocol_error"
      ]))
  );
}

export function normalizePairingCode(value: string): string | undefined {
  const compact = value.replace(/[\s-]/gu, "");
  return /^\d{8}$/u.test(compact) ? compact : undefined;
}

export function isBridgePort(value: unknown): value is number {
  return (
    Number.isInteger(value) && Number(value) >= MIN_BRIDGE_PORT && Number(value) <= MAX_BRIDGE_PORT
  );
}

export function isExtensionError(value: unknown): value is ExtensionError {
  return isOneOfString(value, [
    "authentication_failed",
    "bridge_unavailable",
    "invalid_pairing_code",
    "loopback_permission_denied",
    "loopback_permission_required",
    "not_paired",
    "pairing_expired",
    "protocol_error",
    "request_failed",
    "secure_storage_unavailable"
  ]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOfString<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}
