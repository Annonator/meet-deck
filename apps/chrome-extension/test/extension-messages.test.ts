import { describe, expect, it } from "vitest";

import {
  isExtensionRequest,
  isExtensionResponse,
  normalizePairingCode
} from "../src/shared/extension-messages";

const STATUS = {
  authentication: "unpaired",
  connection: "disconnected",
  meetingMultiplicity: "none",
  paired: false,
  port: 53_421
} as const;

describe("extension UI message validation", () => {
  it("normalises only 25-character human-readable pairing keys", () => {
    expect(normalizePairingCode("23456-789AB-CDEFG-HJKLM-NPQRS")).toBe("23456789ABCDEFGHJKLMNPQRS");
    expect(normalizePairingCode("23456 789ab cdefg hjklm npqrs")).toBe("23456789ABCDEFGHJKLMNPQRS");
    expect(normalizePairingCode("23456789ABCDEFGHJKLMNPQR0")).toBeUndefined();
  });

  it("rejects unknown keys and unsafe bridge ports", () => {
    expect(isExtensionRequest({ kind: "bridge.connect" })).toBe(true);
    expect(isExtensionRequest({ kind: "bridge.connect", extra: true })).toBe(false);
    expect(isExtensionRequest({ kind: "bridge.status.get", extra: true })).toBe(false);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 53_421 })).toBe(true);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 80 })).toBe(false);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 65_536 })).toBe(false);
  });

  it("accepts only closed error codes across the service-worker boundary", () => {
    expect(
      isExtensionResponse({ error: "loopback_permission_denied", ok: false, status: STATUS })
    ).toBe(true);
    expect(isExtensionResponse({ error: "arbitrary prose", ok: false, status: STATUS })).toBe(
      false
    );
    expect(isExtensionResponse({ ok: true, status: STATUS })).toBe(true);
  });
});
