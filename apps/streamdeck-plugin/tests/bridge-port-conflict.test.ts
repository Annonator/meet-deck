import { createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BridgeServer } from "../src/bridge-server.js";

const blockers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    blockers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  );
});

describe("occupied bridge port", () => {
  it("never opens pairing when the genuine plugin failed to bind", async () => {
    const blocker = createServer();
    blockers.push(blocker);
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", resolve);
    });
    const address = blocker.address();
    if (address === null || typeof address === "string") {
      throw new Error("Could not resolve the occupied test port");
    }

    const bridge = new BridgeServer({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      persistCredentials: vi.fn(async () => undefined)
    });

    await expect(bridge.start(address.port)).rejects.toMatchObject({ code: "EADDRINUSE" });
    expect(bridge.status()).toMatchObject({
      listening: false,
      error: `Port ${address.port} is already in use.`
    });

    const pairing = bridge.startPairing();
    expect(pairing.listening).toBe(false);
    expect(pairing).not.toHaveProperty("pairingCode");
    expect(pairing.error).toBe(`Port ${address.port} is already in use.`);
  });
});
