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
  it("normalises only eight-digit pairing codes", () => {
    expect(normalizePairingCode("1234-5678")).toBe("12345678");
    expect(normalizePairingCode("1234 5678")).toBe("12345678");
    expect(normalizePairingCode("1234567a")).toBeUndefined();
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
