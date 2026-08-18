import streamDeck from "@elgato/streamdeck";

import { ActionCoordinator, registerMeetActions } from "./actions.js";
import { BridgeServer, type BridgeStatus, type PairingCredentials } from "./bridge-server.js";
import {
  DEFAULT_BRIDGE_PORT,
  isBase64Url256,
  isChromeExtensionOrigin,
  sanitizeBridgePort
} from "./security.js";

interface RuntimeSettings {
  readonly port: number;
  readonly credentials?: PairingCredentials;
}

type PropertyInspectorRequest =
  | { readonly type: "status.request" }
  | { readonly type: "pairing.start" }
  | { readonly type: "pairing.cancel" }
  | { readonly type: "pairing.unpair" }
  | { readonly type: "port.set"; readonly port: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function isPropertyInspectorRequest(value: unknown): value is PropertyInspectorRequest {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  switch (value.type) {
    case "status.request":
    case "pairing.start":
    case "pairing.cancel":
    case "pairing.unpair":
      return hasExactKeys(value, ["type"]);
    case "port.set":
      return hasExactKeys(value, ["type", "port"]) && sanitizeBridgePort(value.port) !== undefined;
    default:
      return false;
  }
}

function isPairingToken(value: unknown): value is string {
  return isBase64Url256(value);
}

function readSettings(value: unknown): RuntimeSettings {
  if (!isRecord(value)) {
    return { port: DEFAULT_BRIDGE_PORT };
  }
  const port = sanitizeBridgePort(value.port) ?? DEFAULT_BRIDGE_PORT;
  const credentials =
    isPairingToken(value.pairingToken) && isChromeExtensionOrigin(value.pinnedOrigin)
      ? { pairingToken: value.pairingToken, pinnedOrigin: value.pinnedOrigin }
      : undefined;
  return credentials === undefined ? { port } : { port, credentials };
}

export class PluginRuntime {
  readonly #bridge: BridgeServer;
  readonly #coordinator: ActionCoordinator;
  #operationTail: Promise<void> = Promise.resolve();
  #settingsTail: Promise<void> = Promise.resolve();
  #settings: RuntimeSettings = { port: DEFAULT_BRIDGE_PORT };

  constructor() {
    this.#bridge = new BridgeServer({
      logger: {
        info: (message) => streamDeck.logger.info(message),
        warn: (message) => streamDeck.logger.warn(message),
        error: (message) => streamDeck.logger.error(message)
      },
      persistCredentials: async (credentials) => this.#persistCredentials(credentials)
    });
    this.#coordinator = new ActionCoordinator(this.#bridge);
    registerMeetActions(this.#coordinator);

    this.#bridge.onStatus((status) => this.#sendStatus(status));
    streamDeck.ui.onSendToPlugin((event) => {
      void this.#enqueueOperation(() => this.#handlePropertyInspectorRequest(event.payload)).catch(
        () => {
          this.#sendStatus({
            ...this.#bridge.status(),
            error: "The settings request could not be completed."
          });
        }
      );
    });
  }

  async initialize(): Promise<void> {
    await this.#enqueueOperation(() => this.#initialize());
  }

  async #initialize(): Promise<void> {
    const stored = await streamDeck.settings.getGlobalSettings();
    this.#settings = readSettings(stored);
    this.#bridge.setCredentials(this.#settings.credentials);
    try {
      await this.#bridge.start(this.#settings.port);
    } catch {
      // The Property Inspector receives the bridge's safe, user-facing error.
    }
  }

  async #handlePropertyInspectorRequest(payload: unknown): Promise<void> {
    if (!isPropertyInspectorRequest(payload)) {
      this.#sendStatus({ ...this.#bridge.status(), error: "The settings request was invalid." });
      return;
    }

    switch (payload.type) {
      case "status.request":
        this.#sendStatus(this.#bridge.status());
        return;
      case "pairing.start":
        this.#bridge.startPairing();
        return;
      case "pairing.cancel":
        this.#bridge.cancelPairing();
        return;
      case "pairing.unpair":
        try {
          await this.#bridge.unpair();
        } catch {
          this.#sendStatus({ ...this.#bridge.status(), error: "Pairing could not be removed." });
        }
        return;
      case "port.set": {
        const port = sanitizeBridgePort(payload.port);
        if (port === undefined || port === this.#settings.port) {
          this.#sendStatus(this.#bridge.status());
          return;
        }
        try {
          await this.#updateSettings((settings) => ({ ...settings, port }));
        } catch {
          this.#sendStatus({
            ...this.#bridge.status(),
            error: "The bridge port could not be saved."
          });
          return;
        }
        try {
          await this.#bridge.restart(port);
        } catch {
          // The bridge emits a safe error while leaving the PI available for correction.
        }
      }
    }
  }

  async #persistCredentials(credentials: PairingCredentials | undefined): Promise<void> {
    await this.#updateSettings((settings) =>
      credentials === undefined ? { port: settings.port } : { port: settings.port, credentials }
    );
  }

  #updateSettings(update: (current: RuntimeSettings) => RuntimeSettings): Promise<RuntimeSettings> {
    const result = this.#settingsTail.then(async () => {
      const candidate = update(this.#settings);
      await this.#persistSettings(candidate);
      this.#settings = candidate;
      return candidate;
    });
    this.#settingsTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async #persistSettings(settings: RuntimeSettings): Promise<void> {
    await streamDeck.settings.setGlobalSettings({
      port: settings.port,
      ...(settings.credentials === undefined
        ? {}
        : {
            pairingToken: settings.credentials.pairingToken,
            pinnedOrigin: settings.credentials.pinnedOrigin
          })
    });
  }

  #enqueueOperation<T>(operation: () => Promise<T> | T): Promise<T> {
    const result = this.#operationTail.then(operation);
    this.#operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  #sendStatus(status: BridgeStatus): void {
    void streamDeck.ui.sendToPropertyInspector({ ...status }).catch(() => {
      // No Property Inspector is open. This is expected during normal operation.
    });
  }
}
