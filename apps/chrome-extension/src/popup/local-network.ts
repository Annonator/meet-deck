const SUBPROTOCOL = "meet-deck-v1";
const BOOTSTRAP_TIMEOUT_MS = 30_000;

export type LocalNetworkBootstrapResult = "denied" | "granted" | "unavailable";

export function bootstrapLocalNetworkAccess(
  port: number,
  timeoutMs = BOOTSTRAP_TIMEOUT_MS
): Promise<LocalNetworkBootstrapResult> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/v1`, SUBPROTOCOL);
    } catch (error) {
      resolve(
        error instanceof DOMException && error.name === "SecurityError" ? "denied" : "unavailable"
      );
      return;
    }

    let settled = false;
    const finish = (result: LocalNetworkBootstrapResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      socket.close(1000, "permission bootstrap timed out");
      finish("unavailable");
    }, timeoutMs);
    socket.addEventListener("open", () => {
      socket.close(1000, "permission bootstrap complete");
      finish("granted");
    });
    socket.addEventListener("error", () => finish("unavailable"));
    socket.addEventListener("close", () => finish("unavailable"));
  });
}
