import { describe, expect, it } from "vitest";

import { backoffDelay, createBridgeUrl } from "../src/bridge/bridge-client";

describe("bridge connection policy", () => {
  it("pins the bridge URL to numeric loopback", () => {
    expect(createBridgeUrl(53_421)).toBe("ws://127.0.0.1:53421/v1");
  });

  it("uses bounded exponential reconnect backoff with jitter", () => {
    expect(backoffDelay(0, () => 0)).toBe(375);
    expect(backoffDelay(1, () => 0.5)).toBe(1_000);
    expect(backoffDelay(20, () => 1)).toBe(30_000);
  });
});
