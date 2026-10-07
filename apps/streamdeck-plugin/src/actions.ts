import { randomBytes } from "node:crypto";

import streamDeck, {
  action,
  SingletonAction,
  type KeyDownEvent,
  type WillAppearEvent
} from "@elgato/streamdeck";
import {
  PROTOCOL_VERSION,
  type CommandMessage,
  type MeetingStateMessage,
  type ResultMessage
} from "@meet-deck/protocol";

import { type BridgeServer, type BridgeStatus } from "./bridge-server.js";

export type Capability = "microphone" | "camera" | "hand" | "presentation";

type MeetKeyAction = KeyDownEvent["action"];

type VisualState =
  | { readonly kind: "confirmed"; readonly state: 0 | 1; readonly title?: string }
  | {
      readonly kind: "operational";
      readonly image: "offline" | "unknown" | "ambiguous" | "pending";
      readonly title: string;
    };

interface PendingCommand {
  readonly id: string;
  readonly capability: Capability;
  readonly target: boolean;
  readonly source: MeetKeyAction;
  readonly timer: NodeJS.Timeout;
}

const COMMAND_TIMEOUT_MS = 8_000;
const NEEDS_USER_ACTION_TITLE_MS = 5_000;

interface TemporaryTitle {
  readonly title: string;
  readonly timer: NodeJS.Timeout;
}

function commandId(): string {
  return `sd-${randomBytes(12).toString("base64url")}`;
}

function confirmedValue(state: MeetingStateMessage, capability: Capability): boolean | undefined {
  switch (capability) {
    case "microphone":
      return state.microphone === "unknown" ? undefined : state.microphone === "on";
    case "camera":
      return state.camera === "unknown" ? undefined : state.camera === "on";
    case "hand":
      return state.hand === "unknown" ? undefined : state.hand === "raised";
    case "presentation":
      return state.selfPresentation === "unknown" ? undefined : state.selfPresentation === "active";
  }
}

function makeCommand(capability: Capability, target: boolean, id: string): CommandMessage {
  switch (capability) {
    case "microphone":
      return { v: PROTOCOL_VERSION, type: "command", id, action: "microphone.set", value: target };
    case "camera":
      return { v: PROTOCOL_VERSION, type: "command", id, action: "camera.set", value: target };
    case "hand":
      return { v: PROTOCOL_VERSION, type: "command", id, action: "hand.set", value: target };
    case "presentation":
      return {
        v: PROTOCOL_VERSION,
        type: "command",
        id,
        action: target ? "presentation.start" : "presentation.stop"
      };
  }
}

export abstract class MeetAction extends SingletonAction {
  abstract readonly capability: Capability;

  readonly #coordinator: ActionCoordinator;

  constructor(coordinator: ActionCoordinator) {
    super();
    this.#coordinator = coordinator;
  }

  override async onKeyDown(event: KeyDownEvent): Promise<void> {
    await this.#coordinator.trigger(this.capability, event.action);
  }

  override async onWillAppear(event: WillAppearEvent): Promise<void> {
    if (event.action.isKey()) {
      await this.#coordinator.renderOne(this.capability, event.action);
    }
  }

  async renderAll(state: VisualState): Promise<void> {
    const updates: Promise<void>[] = [];
    this.actions.forEach((instance) => {
      if (instance.isKey()) {
        updates.push(this.render(instance, state));
      }
    });
    await Promise.allSettled(updates);
  }

  async render(actionInstance: MeetKeyAction, state: VisualState): Promise<void> {
    if (state.kind === "confirmed") {
      await actionInstance.setImage(undefined);
      await actionInstance.setState(state.state);
      await actionInstance.setTitle(state.title);
      return;
    }
    await actionInstance.setImage(`imgs/status/${state.image}.svg`);
    await actionInstance.setTitle(state.title);
  }
}

@action({ UUID: "dev.annonator.meet-deck.microphone" })
export class MicrophoneAction extends MeetAction {
  override readonly capability = "microphone" as const;
}

@action({ UUID: "dev.annonator.meet-deck.camera" })
export class CameraAction extends MeetAction {
  override readonly capability = "camera" as const;
}

@action({ UUID: "dev.annonator.meet-deck.hand" })
export class HandAction extends MeetAction {
  override readonly capability = "hand" as const;
}

@action({ UUID: "dev.annonator.meet-deck.presentation" })
export class PresentationAction extends MeetAction {
  override readonly capability = "presentation" as const;
}

export class ActionCoordinator {
  readonly #bridge: BridgeServer;
  readonly #actions = new Map<Capability, MeetAction>();
  readonly #pendingById = new Map<string, PendingCommand>();
  readonly #pendingByCapability = new Map<Capability, PendingCommand>();
  readonly #temporaryTitles = new Map<Capability, TemporaryTitle>();

  #state: MeetingStateMessage | undefined;
  #connected = false;

  constructor(bridge: BridgeServer) {
    this.#bridge = bridge;
    bridge.onStatus((status) => this.#onBridgeStatus(status));
    bridge.onApplication((message) => {
      if (message.type === "state") {
        this.#onState(message);
      } else {
        this.#onResult(message);
      }
    });
  }

  register(meetAction: MeetAction): void {
    this.#actions.set(meetAction.capability, meetAction);
  }

  async trigger(capability: Capability, source: MeetKeyAction): Promise<void> {
    const state = this.#state;
    if (
      !this.#connected ||
      state === undefined ||
      state.meetingMultiplicity !== "one" ||
      this.#pendingByCapability.has(capability)
    ) {
      await source.showAlert();
      return;
    }

    const current = confirmedValue(state, capability);
    if (current === undefined) {
      await source.showAlert();
      return;
    }

    this.#clearTemporaryTitle(capability);
    const id = commandId();
    const target = !current;
    const command = makeCommand(capability, target, id);
    const timer = setTimeout(() => {
      const pending = this.#pendingById.get(id);
      if (pending !== undefined) {
        this.#clearPending(pending);
        this.#showAlert(pending.source);
        void this.refreshAll();
      }
    }, COMMAND_TIMEOUT_MS);
    timer.unref();
    const pending: PendingCommand = { id, capability, target, source, timer };
    this.#pendingById.set(id, pending);
    this.#pendingByCapability.set(capability, pending);

    if (!this.#bridge.sendCommand(command)) {
      this.#clearPending(pending);
      await source.showAlert();
      await this.refreshAll();
      return;
    }
    await this.refreshAll();
  }

  async renderOne(capability: Capability, actionInstance: MeetKeyAction): Promise<void> {
    await this.#actions.get(capability)?.render(actionInstance, this.#visualState(capability));
  }

  async refreshAll(): Promise<void> {
    await Promise.allSettled(
      [...this.#actions.entries()].map(([capability, meetAction]) =>
        meetAction.renderAll(this.#visualState(capability))
      )
    );
  }

  #visualState(capability: Capability): VisualState {
    if (!this.#connected) {
      return { kind: "operational", image: "offline", title: "Offline" };
    }
    if (this.#pendingByCapability.has(capability)) {
      return { kind: "operational", image: "pending", title: "Working…" };
    }

    const state = this.#state;
    if (state === undefined) {
      return { kind: "operational", image: "unknown", title: "Unknown" };
    }
    if (state.meetingMultiplicity === "none") {
      return { kind: "operational", image: "offline", title: "No Meet" };
    }
    if (state.meetingMultiplicity === "multiple") {
      return { kind: "operational", image: "ambiguous", title: "Multiple" };
    }

    const value = confirmedValue(state, capability);
    if (value === undefined) {
      return { kind: "operational", image: "unknown", title: "Unknown" };
    }

    const temporaryTitle = this.#temporaryTitles.get(capability)?.title;
    return temporaryTitle === undefined
      ? { kind: "confirmed", state: value ? 1 : 0 }
      : { kind: "confirmed", state: value ? 1 : 0, title: temporaryTitle };
  }

  #onBridgeStatus(status: BridgeStatus): void {
    const wasConnected = this.#connected;
    this.#connected = status.connected;
    if (!status.connected) {
      this.#state = undefined;
      this.#clearAllTemporaryTitles();
      if (wasConnected) {
        this.#failAllPending();
      }
    }
    void this.refreshAll();
  }

  #onState(state: MeetingStateMessage): void {
    this.#state = state;
    for (const pending of [...this.#pendingById.values()]) {
      if (
        state.meetingMultiplicity !== "one" ||
        confirmedValue(state, pending.capability) === pending.target
      ) {
        if (state.meetingMultiplicity !== "one") {
          this.#showAlert(pending.source);
        }
        this.#clearPending(pending);
      }
    }
    void this.refreshAll();
  }

  #onResult(result: ResultMessage): void {
    const pending = this.#pendingById.get(result.id);
    if (pending === undefined || result.status === "ok") {
      return;
    }
    this.#clearPending(pending);
    if (result.status === "needs_user_action" && pending.capability === "presentation") {
      this.#showAlert(pending.source);
      this.#setTemporaryTitle("presentation", "⌃⌘T");
      return;
    }
    if (result.status !== "noop") {
      this.#showAlert(pending.source);
    }
    void this.refreshAll();
  }

  #clearPending(pending: PendingCommand): void {
    clearTimeout(pending.timer);
    this.#pendingById.delete(pending.id);
    if (this.#pendingByCapability.get(pending.capability) === pending) {
      this.#pendingByCapability.delete(pending.capability);
    }
  }

  #setTemporaryTitle(capability: Capability, title: string): void {
    this.#clearTemporaryTitle(capability);
    const timer = setTimeout(() => {
      if (this.#temporaryTitles.get(capability)?.timer === timer) {
        this.#temporaryTitles.delete(capability);
        void this.refreshAll();
      }
    }, NEEDS_USER_ACTION_TITLE_MS);
    timer.unref();
    this.#temporaryTitles.set(capability, { title, timer });
    void this.refreshAll();
  }

  #clearTemporaryTitle(capability: Capability): void {
    const temporaryTitle = this.#temporaryTitles.get(capability);
    if (temporaryTitle !== undefined) {
      clearTimeout(temporaryTitle.timer);
      this.#temporaryTitles.delete(capability);
    }
  }

  #clearAllTemporaryTitles(): void {
    for (const capability of this.#temporaryTitles.keys()) {
      this.#clearTemporaryTitle(capability);
    }
  }

  #failAllPending(): void {
    for (const pending of [...this.#pendingById.values()]) {
      this.#clearPending(pending);
      this.#showAlert(pending.source);
    }
  }

  #showAlert(source: MeetKeyAction): void {
    void source.showAlert().catch(() => {
      // The action may have disappeared before asynchronous feedback completed.
    });
  }
}

export function registerMeetActions(coordinator: ActionCoordinator): void {
  const actions = [
    new MicrophoneAction(coordinator),
    new CameraAction(coordinator),
    new HandAction(coordinator),
    new PresentationAction(coordinator)
  ];
  for (const meetAction of actions) {
    coordinator.register(meetAction);
    streamDeck.actions.registerAction(meetAction);
  }
}
