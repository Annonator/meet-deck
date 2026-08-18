import type { IncomingMessage } from "node:http";

import { describe, expect, it } from "vitest";

import {
  BRIDGE_PATH,
  BRIDGE_SUBPROTOCOL,
  MAX_UNAUTHENTICATED_CONNECTIONS,
  isUpgradeAllowed
} from "../src/bridge-server.js";

const origin = `chrome-extension://${"a".repeat(32)}`;

function request(
  options: {
    readonly url?: string;
    readonly host?: string;
    readonly protocol?: string;
    readonly origin?: string;
    readonly duplicateOrigin?: boolean;
  } = {}
): IncomingMessage {
  const rawHeaders = [
    "Host",
    options.host ?? "127.0.0.1:53421",
    "Origin",
    options.origin ?? origin,
    "Sec-WebSocket-Protocol",
    options.protocol ?? BRIDGE_SUBPROTOCOL
  ];
  if (options.duplicateOrigin) {
    rawHeaders.push("Origin", origin);
  }
  return {
    url: options.url ?? BRIDGE_PATH,
    rawHeaders
  } as IncomingMessage;
}

describe("WebSocket upgrade policy", () => {
  const pairedPolicy = {
    port: 53421,
    pinnedOrigin: origin,
    pairingOpen: false,
    unauthenticatedConnections: 0
  } as const;

  it("accepts only the exact loopback host, path, protocol and pinned origin", () => {
    expect(isUpgradeAllowed(request(), pairedPolicy)).toBe(true);
    expect(isUpgradeAllowed(request({ host: "localhost:53421" }), pairedPolicy)).toBe(false);
    expect(isUpgradeAllowed(request({ host: "127.0.0.1:53422" }), pairedPolicy)).toBe(false);
    expect(isUpgradeAllowed(request({ url: "/v1?token=bad" }), pairedPolicy)).toBe(false);
    expect(isUpgradeAllowed(request({ protocol: "other" }), pairedPolicy)).toBe(false);
    expect(
      isUpgradeAllowed(request({ origin: `chrome-extension://${"b".repeat(32)}` }), pairedPolicy)
    ).toBe(false);
  });

  it("rejects missing, duplicate and non-extension origins", () => {
    expect(isUpgradeAllowed(request({ duplicateOrigin: true }), pairedPolicy)).toBe(false);
    expect(isUpgradeAllowed(request({ origin: "null" }), pairedPolicy)).toBe(false);
    expect(isUpgradeAllowed(request({ origin: "https://meet.google.com" }), pairedPolicy)).toBe(
      false
    );
  });

  it("allows a new valid extension origin only while explicit pairing is open", () => {
    const newOriginRequest = request({ origin: `chrome-extension://${"b".repeat(32)}` });
    expect(isUpgradeAllowed(newOriginRequest, { ...pairedPolicy, pairingOpen: true })).toBe(true);
    expect(isUpgradeAllowed(newOriginRequest, pairedPolicy)).toBe(false);
  });

  it("caps unauthenticated sockets", () => {
    expect(
      isUpgradeAllowed(request(), {
        ...pairedPolicy,
        unauthenticatedConnections: MAX_UNAUTHENTICATED_CONNECTIONS
      })
    ).toBe(false);
  });
});
