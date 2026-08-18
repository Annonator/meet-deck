import { describe, expect, it } from "vitest";

import { isExtensionRequest, normalizePairingCode } from "../src/shared/extension-messages";

describe("extension UI message validation", () => {
  it("normalises only eight-digit pairing codes", () => {
    expect(normalizePairingCode("1234-5678")).toBe("12345678");
    expect(normalizePairingCode("1234 5678")).toBe("12345678");
    expect(normalizePairingCode("1234567a")).toBeUndefined();
  });

  it("rejects unknown keys and unsafe bridge ports", () => {
    expect(isExtensionRequest({ kind: "bridge.status.get", extra: true })).toBe(false);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 53_421 })).toBe(true);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 80 })).toBe(false);
    expect(isExtensionRequest({ kind: "bridge.port.set", port: 65_536 })).toBe(false);
  });
});
