// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtensionRequest, PublicBridgeStatus } from "../src/shared/extension-messages";

const popupHtml = await readFile(resolve(process.cwd(), "public/popup.html"), "utf8");
const popupCss = await readFile(resolve(process.cwd(), "public/popup.css"), "utf8");

const UNPAIRED: PublicBridgeStatus = {
  authentication: "unpaired",
  connection: "disconnected",
  meetingMultiplicity: "none",
  paired: false,
  port: 53_421
};

const PERMISSION_REQUIRED: PublicBridgeStatus = {
  authentication: "rejected",
  connection: "disconnected",
  meetingMultiplicity: "none",
  paired: true,
  port: 53_421,
  problem: "loopback_permission_required"
};

describe("popup pairing and loopback permission flow", () => {
  const permissionRequest = vi.fn();
  const permissionRemove = vi.fn(async () => false);
  const sendMessage = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    permissionRequest.mockReset();
    permissionRemove.mockReset().mockResolvedValue(false);
    sendMessage.mockReset();
    document.open();
    document.write(popupHtml);
    document.close();
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn(() => ""),
        getUILanguage: vi.fn(() => "en")
      },
      permissions: {
        remove: permissionRemove,
        request: permissionRequest
      },
      runtime: {
        sendMessage
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("leaves pairing untouched when the user denies exact loopback access", async () => {
    permissionRequest.mockResolvedValueOnce(false);
    sendMessage.mockResolvedValue({ ok: true, status: UNPAIRED });
    await import("../src/popup");
    await waitForInitialStatus();

    submitPairing("12345678");

    expect(permissionRequest).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(permissionRequest).toHaveBeenCalledOnce());
    expect(permissionRequest).toHaveBeenCalledWith({
      origins: ["ws://127.0.0.1:53421/*"]
    });
    expect(sentRequests()).toEqual([{ kind: "bridge.status.get" }]);
    await vi.waitFor(() => {
      expect(requiredElement("form-error").textContent).toContain("Chrome denied access");
    });
  });

  it("keeps hidden state authoritative over authored form layout", () => {
    expect(popupCss).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important;/u);
  });

  it("saves the exact granted port before sending the pairing code", async () => {
    permissionRequest.mockResolvedValueOnce(true);
    sendMessage.mockImplementation(async (request: ExtensionRequest) => {
      switch (request.kind) {
        case "bridge.status.get":
          return { ok: true, status: UNPAIRED };
        case "bridge.port.set":
          return { ok: true, status: { ...UNPAIRED, port: request.port } };
        case "bridge.pair":
          return {
            ok: true,
            status: {
              ...UNPAIRED,
              authentication: "authenticated",
              connection: "connected",
              paired: true
            }
          };
        default:
          return { ok: true, status: UNPAIRED };
      }
    });
    await import("../src/popup");
    await waitForInitialStatus();

    submitPairing("1234-5678");

    expect(permissionRequest).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(sentRequests()).toEqual([
        { kind: "bridge.status.get" },
        { kind: "bridge.port.set", port: 53_421 },
        { code: "12345678", kind: "bridge.pair" }
      ])
    );
    expect(permissionRequest.mock.invocationCallOrder[0]).toBeLessThan(
      sendMessage.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY
    );
  });

  it("recovers a stored pairing through Connect without requiring a new code", async () => {
    permissionRequest.mockResolvedValueOnce(true);
    sendMessage.mockImplementation(async (request: ExtensionRequest) => {
      if (request.kind === "bridge.connect") {
        return {
          ok: true,
          status: {
            ...PERMISSION_REQUIRED,
            authentication: "pairing",
            connection: "connecting",
            problem: undefined
          }
        };
      }
      return { ok: true, status: PERMISSION_REQUIRED };
    });
    await import("../src/popup");
    await waitForInitialStatus();

    const connectButton = requiredElement<HTMLButtonElement>("connect-button");
    expect(connectButton.hidden).toBe(false);
    connectButton.click();

    expect(permissionRequest).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(sentRequests()).toContainEqual({ kind: "bridge.connect" }));
    expect(sentRequests()).not.toContainEqual(expect.objectContaining({ kind: "bridge.pair" }));
    expect(permissionRequest).toHaveBeenCalledWith({
      origins: ["ws://127.0.0.1:53421/*"]
    });
  });

  it("keeps actions disabled until the authoritative status is loaded", async () => {
    const initialStatus = deferred<{ ok: true; status: PublicBridgeStatus }>();
    sendMessage.mockReturnValueOnce(initialStatus.promise);

    await import("../src/popup");

    for (const id of [
      "pair-code",
      "pair-button",
      "connect-button",
      "bridge-port",
      "port-save-button",
      "forget-button"
    ]) {
      expect(requiredElement<HTMLInputElement | HTMLButtonElement>(id).disabled).toBe(true);
    }

    initialStatus.resolve({ ok: true, status: UNPAIRED });
    await waitForInitialStatus();
    expect(requiredElement<HTMLButtonElement>("pair-button").disabled).toBe(false);
  });

  it("removes the authoritative current grant after forgetting", async () => {
    sendMessage.mockImplementation(async (request: ExtensionRequest) => {
      if (request.kind === "bridge.pair.forget") {
        return { ok: true, status: { ...UNPAIRED, port: 54_321 } };
      }
      return { ok: true, status: { ...PERMISSION_REQUIRED, port: 53_421 } };
    });
    permissionRemove.mockResolvedValueOnce(true);
    await import("../src/popup");
    await waitForInitialStatus();

    requiredElement<HTMLButtonElement>("forget-button").click();

    await vi.waitFor(() =>
      expect(permissionRemove).toHaveBeenCalledWith({
        origins: ["ws://127.0.0.1:54321/*"]
      })
    );
  });

  function waitForInitialStatus(): Promise<void> {
    return vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ kind: "bridge.status.get" });
      expect(requiredElement<HTMLButtonElement>("pair-button").disabled).toBe(false);
    });
  }

  function sentRequests(): ExtensionRequest[] {
    return sendMessage.mock.calls.map(([request]) => request as ExtensionRequest);
  }
});

function submitPairing(code: string): void {
  requiredElement<HTMLInputElement>("pair-code").value = code;
  requiredElement<HTMLFormElement>("pair-form").dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true })
  );
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing test element: ${id}`);
  }
  return element as T;
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
