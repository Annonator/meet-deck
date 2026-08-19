import { isBridgePort } from "./extension-messages";

export type LoopbackPermissionRequestResult = "denied" | "granted" | "invalid" | "unavailable";
export type LoopbackPermissionRemovalResult = "invalid" | "not_granted" | "removed" | "unavailable";
export type LoopbackPermissionState = "granted" | "invalid" | "missing" | "unavailable";

export function loopbackPermissionOrigin(port: number): string | undefined {
  return isBridgePort(port) ? `ws://127.0.0.1:${port}/*` : undefined;
}

/**
 * Call this directly from the pairing or reconnection event handler. Invoking
 * permissions.request() immediately preserves Chrome's user gesture. It is
 * intentionally not preceded by an asynchronous permissions.contains() call;
 * request() resolves true without another prompt when access is already active.
 */
export function requestLoopbackPermission(port: number): Promise<LoopbackPermissionRequestResult> {
  const origin = loopbackPermissionOrigin(port);
  if (origin === undefined) {
    return Promise.resolve("invalid");
  }

  try {
    return chrome.permissions.request({ origins: [origin] }).then(
      (granted) => (granted ? "granted" : "denied"),
      () => "unavailable"
    );
  } catch {
    return Promise.resolve("unavailable");
  }
}

export function getLoopbackPermissionState(port: number): Promise<LoopbackPermissionState> {
  const origin = loopbackPermissionOrigin(port);
  if (origin === undefined) {
    return Promise.resolve("invalid");
  }

  try {
    return chrome.permissions.contains({ origins: [origin] }).then(
      (granted) => (granted ? "granted" : "missing"),
      () => "unavailable"
    );
  } catch {
    return Promise.resolve("unavailable");
  }
}

export function removeLoopbackPermission(port: number): Promise<LoopbackPermissionRemovalResult> {
  const origin = loopbackPermissionOrigin(port);
  if (origin === undefined) {
    return Promise.resolve("invalid");
  }

  try {
    return chrome.permissions.remove({ origins: [origin] }).then(
      (removed) => (removed ? "removed" : "not_granted"),
      () => "unavailable"
    );
  } catch {
    return Promise.resolve("unavailable");
  }
}
