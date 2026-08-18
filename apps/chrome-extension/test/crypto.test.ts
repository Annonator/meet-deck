import { describe, expect, it } from "vitest";

import {
  decodeBase64Url,
  deriveSessionHmacKey,
  encodeBase64Url,
  hmacSha256Bytes,
  signWithKey,
  verifyWithKey
} from "../src/bridge/crypto";
import { isToken } from "../src/bridge/settings";

const encoder = new TextEncoder();

describe("bridge cryptography", () => {
  it("matches the RFC 4231 HMAC-SHA-256 test vector", async () => {
    const secret = encodeBase64Url(new Uint8Array(20).fill(0x0b));
    await expect(hmacSha256Bytes(secret, encoder.encode("Hi There"))).resolves.toBe(
      "sDRMYdjbOFNcqK_OrwvxK4gdwgDJgz2nJuk3bC4yz_c"
    );
  });

  it("round-trips unpadded base64url without accepting punctuation", () => {
    const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    expect(decodeBase64Url(encodeBase64Url(bytes))).toEqual(bytes);
    expect(() => decodeBase64Url("not+base64")).toThrow("Invalid base64url");
  });

  it("accepts only canonical unpadded base64url encodings for 256-bit tokens", () => {
    expect(isToken(encodeBase64Url(new Uint8Array(32).fill(7)))).toBe(true);
    expect(isToken("A".repeat(43))).toBe(true);
    expect(isToken(`${"A".repeat(42)}B`)).toBe(false);
    expect(isToken("A".repeat(42))).toBe(false);
  });

  it("derives distinct direction-bound keys and verifies frame MACs", async () => {
    const token = encodeBase64Url(new Uint8Array(32).fill(7));
    const salt = encoder.encode("fixed-session-salt");
    const outbound = await deriveSessionHmacKey(token, salt, encoder.encode("extension_to_plugin"));
    const inbound = await deriveSessionHmacKey(token, salt, encoder.encode("plugin_to_extension"));
    const payload = encoder.encode("protected-frame");
    const mac = await signWithKey(outbound, payload);

    await expect(verifyWithKey(outbound, payload, mac)).resolves.toBe(true);
    await expect(verifyWithKey(inbound, payload, mac)).resolves.toBe(false);
  });
});
