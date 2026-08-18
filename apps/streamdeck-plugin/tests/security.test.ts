import { describe, expect, it } from "vitest";

import {
  MAX_PAIRING_ATTEMPTS,
  PAIRING_TTL_MS,
  PairingManager,
  createMac,
  createProof,
  deriveSessionKey,
  isBase64Url256,
  isChromeExtensionOrigin,
  sanitizeBridgePort,
  verifyMac,
  verifyProof
} from "../src/security.js";
import {
  encodeProtectedMessageMacInput,
  type AuthBinding,
  type ProtectedMacInput
} from "@meet-deck/protocol";

const binding: AuthBinding = {
  session: Buffer.alloc(32, 1).toString("base64url"),
  clientNonce: Buffer.alloc(32, 2).toString("base64url"),
  serverNonce: Buffer.alloc(32, 3).toString("base64url"),
  origin: `chrome-extension://${"a".repeat(32)}`,
  clientRole: "extension",
  serverRole: "plugin"
};

describe("PairingManager", () => {
  it("creates a one-use eight-digit code and a 256-bit token", () => {
    const manager = new PairingManager({
      code: () => "01234567",
      token: () => "T".repeat(43)
    });
    const opened = manager.start(1_000);

    expect(opened).toEqual({
      code: "01234567",
      expiresAt: 1_000 + PAIRING_TTL_MS,
      attemptsRemaining: MAX_PAIRING_ATTEMPTS
    });
    expect(manager.attempt("01234567", 1_001)).toEqual({
      ok: true,
      token: "T".repeat(43)
    });
    expect(manager.attempt("01234567", 1_002)).toEqual({
      ok: false,
      reason: "pairing_closed"
    });
  });

  it("locks the window on the fifth bad attempt", () => {
    const manager = new PairingManager({
      code: () => "12345678",
      token: () => "T".repeat(43)
    });
    manager.start(0);

    for (let attempt = 1; attempt < MAX_PAIRING_ATTEMPTS; attempt += 1) {
      expect(manager.attempt("00000000", attempt)).toEqual({
        ok: false,
        reason: "invalid_code"
      });
    }
    expect(manager.attempt("00000000", MAX_PAIRING_ATTEMPTS)).toEqual({
      ok: false,
      reason: "rate_limited"
    });
    expect(manager.isOpen(MAX_PAIRING_ATTEMPTS + 1)).toBe(false);
  });

  it("rejects an expired code", () => {
    const manager = new PairingManager({
      code: () => "12345678",
      token: () => "T".repeat(43)
    });
    manager.start(500);

    expect(manager.attempt("12345678", 500 + PAIRING_TTL_MS)).toEqual({
      ok: false,
      reason: "expired_code"
    });
  });
});

describe("bridge input validation", () => {
  it.each([1024, 53421, 65535, "53421"])("accepts valid port %s", (port) => {
    expect(sanitizeBridgePort(port)).toBe(Number(port));
  });

  it.each([0, 1023, 65536, 53421.5, "53x", null, undefined])("rejects invalid port %s", (port) => {
    expect(sanitizeBridgePort(port)).toBeUndefined();
  });

  it("accepts only canonical Chrome extension origins", () => {
    expect(isChromeExtensionOrigin(`chrome-extension://${"a".repeat(32)}`)).toBe(true);
    expect(isChromeExtensionOrigin(`chrome-extension://${"q".repeat(32)}`)).toBe(false);
    expect(isChromeExtensionOrigin(`chrome-extension://${"a".repeat(32)}/`)).toBe(false);
    expect(isChromeExtensionOrigin("https://meet.google.com")).toBe(false);
  });

  it("accepts only canonical unpadded base64url encodings of 256 bits", () => {
    expect(isBase64Url256(Buffer.alloc(32, 1).toString("base64url"))).toBe(true);
    expect(isBase64Url256("A".repeat(43))).toBe(true);
    expect(isBase64Url256(`${"A".repeat(42)}B`)).toBe(false);
    expect(isBase64Url256("A".repeat(42))).toBe(false);
  });
});

describe("session cryptography", () => {
  const token = Buffer.alloc(32, 7).toString("base64url");

  it("binds authentication proofs to both roles", () => {
    const extensionProof = createProof(token, binding, "extension");
    expect(verifyProof(token, binding, "extension", extensionProof)).toBe(true);
    expect(verifyProof(token, binding, "plugin", extensionProof)).toBe(false);
  });

  it("derives separate keys for each transport direction", () => {
    const inbound = deriveSessionKey(token, binding, "extension_to_plugin");
    const outbound = deriveSessionKey(token, binding, "plugin_to_extension");
    expect(inbound).toHaveLength(32);
    expect(outbound).toHaveLength(32);
    expect(inbound.equals(outbound)).toBe(false);
  });

  it("detects a changed protected frame", () => {
    const key = deriveSessionKey(token, binding, "plugin_to_extension");
    const input: ProtectedMacInput = {
      v: 1,
      type: "protected",
      session: binding.session,
      direction: "plugin_to_extension",
      seq: 1,
      message: { v: 1, type: "command", id: "test-1", action: "camera.set", value: true }
    };
    const mac = createMac(key, encodeProtectedMessageMacInput(input));
    const changed: ProtectedMacInput = {
      ...input,
      message: {
        v: 1,
        type: "command",
        id: "test-1",
        action: "camera.set",
        value: false
      }
    };

    expect(verifyMac(key, encodeProtectedMessageMacInput(input), mac)).toBe(true);
    expect(verifyMac(key, encodeProtectedMessageMacInput(changed), mac)).toBe(false);
  });
});
