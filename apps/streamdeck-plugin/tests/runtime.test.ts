import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

interface Credentials {
  readonly pairingToken: string;
  readonly pinnedOrigin: string;
}

interface FakeBridgeHarness {
  readonly start: Mock<(port?: number) => Promise<void>>;
  readonly restart: Mock<(port: number) => Promise<void>>;
  readonly setCredentials: Mock<(credentials: Credentials | undefined) => void>;
  persist(credentials: Credentials | undefined): Promise<void>;
}

const harness = vi.hoisted(() => ({
  bridge: undefined as FakeBridgeHarness | undefined,
  propertyInspectorListener: undefined as
    ((event: { readonly payload: unknown }) => void) | undefined,
  getGlobalSettings: vi.fn(),
  setGlobalSettings: vi.fn(),
  sendToPropertyInspector: vi.fn(async () => undefined)
}));

vi.mock("@elgato/streamdeck", () => ({
  default: {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    settings: {
      getGlobalSettings: harness.getGlobalSettings,
      setGlobalSettings: harness.setGlobalSettings
    },
    ui: {
      onSendToPlugin: vi.fn(
        (listener: (event: { readonly payload: unknown }) => void) =>
          (harness.propertyInspectorListener = listener)
      ),
      sendToPropertyInspector: harness.sendToPropertyInspector
    }
  }
}));

vi.mock("../src/actions.js", () => ({
  ActionCoordinator: class {
    constructor() {}
  },
  registerMeetActions: vi.fn()
}));

vi.mock("../src/bridge-server.js", () => ({
  BridgeServer: class {
    readonly start = vi.fn<(port?: number) => Promise<void>>(async () => undefined);
    readonly restart = vi.fn<(port: number) => Promise<void>>(async () => undefined);
    readonly setCredentials = vi.fn<(credentials: Credentials | undefined) => void>();
    readonly #persistCredentials: (credentials: Credentials | undefined) => Promise<void>;

    constructor(options: {
      readonly persistCredentials: (credentials: Credentials | undefined) => Promise<void>;
    }) {
      this.#persistCredentials = options.persistCredentials;
      harness.bridge = this;
    }

    onStatus(
      listener: (status: {
        readonly type: "bridge.status";
        readonly port: number;
        readonly listening: boolean;
        readonly paired: boolean;
        readonly connected: boolean;
      }) => void
    ): () => void {
      listener(this.status());
      return () => undefined;
    }

    status() {
      return {
        type: "bridge.status" as const,
        port: 53_421,
        listening: true,
        paired: true,
        connected: false
      };
    }

    startPairing(): void {}

    cancelPairing(): void {}

    async unpair(): Promise<void> {
      await this.#persistCredentials(undefined);
    }

    async persist(credentials: Credentials | undefined): Promise<void> {
      await this.#persistCredentials(credentials);
    }
  }
}));

import { PluginRuntime } from "../src/runtime.js";

const oldCredentials: Credentials = {
  pairingToken: Buffer.alloc(32, 1).toString("base64url"),
  pinnedOrigin: `chrome-extension://${"a".repeat(32)}`
};
const newCredentials: Credentials = {
  pairingToken: Buffer.alloc(32, 2).toString("base64url"),
  pinnedOrigin: `chrome-extension://${"b".repeat(32)}`
};

function bridge(): FakeBridgeHarness {
  if (harness.bridge === undefined) {
    throw new Error("Bridge was not created");
  }
  return harness.bridge;
}

function sendToPlugin(payload: unknown): void {
  const listener = harness.propertyInspectorListener;
  if (listener === undefined) {
    throw new Error("Property Inspector listener was not registered");
  }
  listener({ payload });
}

function deferredVoid(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let release: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, resolve: release };
}

describe("PluginRuntime settings transactions", () => {
  beforeEach(() => {
    harness.bridge = undefined;
    harness.propertyInspectorListener = undefined;
    harness.getGlobalSettings.mockReset();
    harness.setGlobalSettings.mockReset();
    harness.sendToPropertyInspector.mockClear();
    harness.getGlobalSettings.mockResolvedValue({
      port: 53_421,
      pairingToken: oldCredentials.pairingToken,
      pinnedOrigin: oldCredentials.pinnedOrigin
    });
    harness.setGlobalSettings.mockResolvedValue(undefined);
  });

  it("does not commit a rejected port candidate into a later credential write", async () => {
    const runtime = new PluginRuntime();
    await runtime.initialize();
    harness.setGlobalSettings.mockRejectedValueOnce(new Error("storage unavailable"));

    sendToPlugin({ type: "port.set", port: 53_422 });
    await vi.waitFor(() =>
      expect(harness.sendToPropertyInspector).toHaveBeenCalledWith(
        expect.objectContaining({ error: "The bridge port could not be saved." })
      )
    );

    await bridge().persist(newCredentials);

    expect(bridge().restart).not.toHaveBeenCalled();
    expect(harness.setGlobalSettings).toHaveBeenLastCalledWith({
      port: 53_421,
      pairingToken: newCredentials.pairingToken,
      pinnedOrigin: newCredentials.pinnedOrigin
    });
  });

  it("serializes initialization, persistence and bridge restarts in FIFO order", async () => {
    const storedSettings = deferredVoid();
    harness.getGlobalSettings.mockImplementationOnce(async () => {
      await storedSettings.promise;
      return { port: 53_421 };
    });
    const runtime = new PluginRuntime();
    const initializing = runtime.initialize();
    sendToPlugin({ type: "port.set", port: 53_422 });

    await Promise.resolve();
    expect(harness.setGlobalSettings).not.toHaveBeenCalled();
    storedSettings.resolve();
    await initializing;

    const firstPersistence = deferredVoid();
    const firstRestart = deferredVoid();
    harness.setGlobalSettings.mockImplementationOnce(() => firstPersistence.promise);
    bridge().restart.mockImplementationOnce(() => firstRestart.promise);
    sendToPlugin({ type: "port.set", port: 53_423 });

    await vi.waitFor(() =>
      expect(harness.setGlobalSettings).toHaveBeenCalledWith({ port: 53_422 })
    );
    expect(bridge().restart).not.toHaveBeenCalled();

    firstPersistence.resolve();
    await vi.waitFor(() => expect(bridge().restart).toHaveBeenCalledWith(53_422));
    expect(harness.setGlobalSettings).toHaveBeenCalledTimes(1);

    firstRestart.resolve();
    await vi.waitFor(() =>
      expect(harness.setGlobalSettings).toHaveBeenLastCalledWith({ port: 53_423 })
    );
    await vi.waitFor(() => expect(bridge().restart).toHaveBeenCalledWith(53_423));
  });
});
