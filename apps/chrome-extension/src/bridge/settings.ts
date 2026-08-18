import { DEFAULT_BRIDGE_PORT, isBridgePort } from "../shared/extension-messages";

const STORAGE_KEY = "meetDeck.bridge.v1";

export interface BridgeSettings {
  readonly port: number;
  readonly token?: string;
}

const DEFAULT_SETTINGS: BridgeSettings = Object.freeze({ port: DEFAULT_BRIDGE_PORT });

export async function restrictStorageToTrustedContexts(): Promise<void> {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
}

export async function loadBridgeSettings(): Promise<BridgeSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const candidate: unknown = stored[STORAGE_KEY];
  if (!isRecord(candidate) || !isBridgePort(candidate.port)) {
    return DEFAULT_SETTINGS;
  }

  if (typeof candidate.token === "string" && isToken(candidate.token)) {
    return { port: candidate.port, token: candidate.token };
  }

  return { port: candidate.port };
}

export async function saveBridgeSettings(settings: BridgeSettings): Promise<void> {
  const safe: BridgeSettings = settings.token === undefined ? { port: settings.port } : settings;
  await chrome.storage.local.set({ [STORAGE_KEY]: safe });
}

export function isToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
