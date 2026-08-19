import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getLoopbackPermissionState,
  loopbackPermissionOrigin,
  removeLoopbackPermission,
  requestLoopbackPermission
} from "../src/shared/loopback-permission";

describe("popup loopback host permission", () => {
  let originalChrome: typeof chrome | undefined;
  let originalWebSocket: typeof WebSocket;
  const request = vi.fn();
  const remove = vi.fn();
  const contains = vi.fn();

  beforeEach(() => {
    request.mockReset();
    remove.mockReset();
    contains.mockReset();
    originalChrome = globalThis.chrome;
    originalWebSocket = globalThis.WebSocket;
    globalThis.chrome = {
      permissions: { contains, remove, request }
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    if (originalChrome === undefined) {
      Reflect.deleteProperty(globalThis, "chrome");
    } else {
      globalThis.chrome = originalChrome;
    }
  });

  it("requests only the configured IPv4 loopback WebSocket origin", async () => {
    request.mockResolvedValueOnce(true);

    const outcome = requestLoopbackPermission(53_421);

    expect(request).toHaveBeenCalledWith({ origins: ["ws://127.0.0.1:53421/*"] });
    await expect(outcome).resolves.toBe("granted");
  });

  it("treats an already-active grant as granted without opening a socket", async () => {
    const webSocket = vi.fn();
    globalThis.WebSocket = webSocket as unknown as typeof WebSocket;
    request.mockResolvedValueOnce(true);

    await expect(requestLoopbackPermission(53_421)).resolves.toBe("granted");
    expect(webSocket).not.toHaveBeenCalled();
  });

  it("checks persisted access without opening a permission prompt", async () => {
    contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(getLoopbackPermissionState(53_421)).resolves.toBe("granted");
    await expect(getLoopbackPermissionState(54_321)).resolves.toBe("missing");
    expect(contains).toHaveBeenNthCalledWith(1, {
      origins: ["ws://127.0.0.1:53421/*"]
    });
    expect(request).not.toHaveBeenCalled();
  });

  it("distinguishes user denial from an unavailable permissions API", async () => {
    request
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("permissions unavailable"));

    await expect(requestLoopbackPermission(53_421)).resolves.toBe("denied");
    await expect(requestLoopbackPermission(53_421)).resolves.toBe("unavailable");
  });

  it("rejects an invalid port before requesting access", async () => {
    expect(loopbackPermissionOrigin(80)).toBeUndefined();
    await expect(requestLoopbackPermission(80)).resolves.toBe("invalid");
    expect(request).not.toHaveBeenCalled();
  });

  it("removes the old exact-port grant when it is no longer needed", async () => {
    remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(removeLoopbackPermission(53_421)).resolves.toBe("removed");
    expect(remove).toHaveBeenCalledWith({ origins: ["ws://127.0.0.1:53421/*"] });
    await expect(removeLoopbackPermission(53_421)).resolves.toBe("not_granted");
  });
});
