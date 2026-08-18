import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { bootstrapLocalNetworkAccess } from "../src/popup/local-network";

class BootstrapSocket extends EventTarget {
  static readonly instances: BootstrapSocket[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];

  constructor(
    readonly url: string,
    readonly protocol: string
  ) {
    super();
    BootstrapSocket.instances.push(this);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({
      ...(code === undefined ? {} : { code }),
      ...(reason === undefined ? {} : { reason })
    });
  }
}

describe("popup Local Network Access bootstrap", () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    originalWebSocket = globalThis.WebSocket;
    BootstrapSocket.instances.length = 0;
    globalThis.WebSocket = BootstrapSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it("opens loopback directly from the visible popup user gesture", async () => {
    const outcome = bootstrapLocalNetworkAccess(53_421, 1_000);
    const socket = BootstrapSocket.instances[0];
    expect(socket).toMatchObject({
      url: "ws://127.0.0.1:53421/v1",
      protocol: "meet-deck-v1"
    });
    socket?.dispatchEvent(new Event("open"));

    await expect(outcome).resolves.toBe("granted");
    expect(socket?.closed).toHaveLength(1);
  });

  it("reports a synchronous Chrome security denial without retrying", async () => {
    globalThis.WebSocket = class {
      constructor() {
        throw new DOMException("denied", "SecurityError");
      }
    } as unknown as typeof WebSocket;

    await expect(bootstrapLocalNetworkAccess(53_421, 1_000)).resolves.toBe("denied");
  });

  it("reports an unavailable local bridge", async () => {
    const outcome = bootstrapLocalNetworkAccess(53_421, 1_000);
    BootstrapSocket.instances[0]?.dispatchEvent(new Event("error"));
    await expect(outcome).resolves.toBe("unavailable");
  });
});
