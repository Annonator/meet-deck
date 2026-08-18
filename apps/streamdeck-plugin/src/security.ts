import { createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import {
  encodeAuthProofInput,
  encodeSessionKeyInfo,
  encodeSessionKeySalt,
  type AuthBinding,
  type AuthRole,
  type PairRejectionReason,
  type TransportDirection
} from "@meet-deck/protocol";

export const PAIRING_TTL_MS = 120_000;
export const MAX_PAIRING_ATTEMPTS = 5;
export const DEFAULT_BRIDGE_PORT = 53_421;
export const MIN_BRIDGE_PORT = 1_024;
export const MAX_BRIDGE_PORT = 65_535;

export interface PairingSnapshot {
  readonly code: string;
  readonly expiresAt: number;
  readonly attemptsRemaining: number;
}

export type PairingAttempt =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly reason: PairRejectionReason };

interface PairingWindow {
  readonly code: string;
  readonly expiresAt: number;
  attempts: number;
}

interface PairingRandomSource {
  code(): string;
  token(): string;
}

const securePairingRandom: PairingRandomSource = {
  code: () => randomInt(0, 100_000_000).toString().padStart(8, "0"),
  token: () => randomBytes(32).toString("base64url")
};

function constantTimeTextEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export class PairingManager {
  readonly #random: PairingRandomSource;
  #window: PairingWindow | undefined;

  constructor(random: PairingRandomSource = securePairingRandom) {
    this.#random = random;
  }

  start(now = Date.now()): PairingSnapshot {
    this.#window = {
      code: this.#random.code(),
      expiresAt: now + PAIRING_TTL_MS,
      attempts: 0
    };
    return this.snapshot(now)!;
  }

  cancel(): void {
    this.#window = undefined;
  }

  isOpen(now = Date.now()): boolean {
    return this.#window !== undefined && now < this.#window.expiresAt;
  }

  snapshot(now = Date.now()): PairingSnapshot | undefined {
    const window = this.#window;
    if (window === undefined || now >= window.expiresAt) {
      return undefined;
    }
    return {
      code: window.code,
      expiresAt: window.expiresAt,
      attemptsRemaining: MAX_PAIRING_ATTEMPTS - window.attempts
    };
  }

  attempt(code: string, now = Date.now()): PairingAttempt {
    const window = this.#window;
    if (window === undefined) {
      return { ok: false, reason: "pairing_closed" };
    }
    if (now >= window.expiresAt) {
      this.#window = undefined;
      return { ok: false, reason: "expired_code" };
    }
    if (window.attempts >= MAX_PAIRING_ATTEMPTS) {
      this.#window = undefined;
      return { ok: false, reason: "rate_limited" };
    }
    if (!constantTimeTextEquals(code, window.code)) {
      window.attempts += 1;
      if (window.attempts >= MAX_PAIRING_ATTEMPTS) {
        this.#window = undefined;
        return { ok: false, reason: "rate_limited" };
      }
      return { ok: false, reason: "invalid_code" };
    }

    const token = this.#random.token();
    this.#window = undefined;
    return { ok: true, token };
  }
}

export function sanitizeBridgePort(value: unknown): number | undefined {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < MIN_BRIDGE_PORT ||
    parsed > MAX_BRIDGE_PORT
  ) {
    return undefined;
  }
  return parsed;
}

export function isChromeExtensionOrigin(value: unknown): value is string {
  return typeof value === "string" && /^chrome-extension:\/\/[a-p]{32}$/.test(value);
}

export function isBase64Url256(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value);
}

export function randomBase64Url(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createProof(token: string, binding: AuthBinding, role: AuthRole): string {
  return createHmac("sha256", Buffer.from(token, "base64url"))
    .update(encodeAuthProofInput(binding, role))
    .digest("base64url");
}

export function verifyProof(
  token: string,
  binding: AuthBinding,
  role: AuthRole,
  proof: string
): boolean {
  const expected = Buffer.from(createProof(token, binding, role), "base64url");
  const actual = Buffer.from(proof, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function deriveSessionKey(
  token: string,
  binding: AuthBinding,
  direction: TransportDirection
): Buffer {
  return Buffer.from(
    hkdfSync(
      "sha256",
      Buffer.from(token, "base64url"),
      encodeSessionKeySalt(binding),
      encodeSessionKeyInfo(binding, direction),
      32
    )
  );
}

export function verifyMac(key: Buffer, input: Uint8Array, mac: string): boolean {
  const expected = createHmac("sha256", key).update(input).digest();
  const actual = Buffer.from(mac, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createMac(key: Buffer, input: Uint8Array): string {
  return createHmac("sha256", key).update(input).digest("base64url");
}
