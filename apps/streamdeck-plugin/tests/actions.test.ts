import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({
  default: {
    actions: { registerAction: vi.fn() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  },
  action: () => (target: object) => target,
  SingletonAction: class {
    readonly actions: unknown[] = [];
  }
}));

import type { KeyDownEvent, WillAppearEvent } from "@elgato/streamdeck";
import type { MeetingStateMessage, ResultMessage } from "@meet-deck/protocol";

import { ActionCoordinator, MicrophoneAction, PresentationAction } from "../src/actions.js";
import type { BridgeServer, BridgeStatus } from "../src/bridge-server.js";

type KeyAction = KeyDownEvent["action"];

class FakeBridge {
  readonly sent: unknown[] = [];
  #statusListeners: Array<(status: BridgeStatus) => void> = [];
  #applicationListeners: Array<(message: MeetingStateMessage | ResultMessage) => void> = [];

  onStatus(listener: (status: BridgeStatus) => void): () => void {
    this.#statusListeners.push(listener);
    listener(this.status(false));
    return () => undefined;
  }

  onApplication(listener: (message: MeetingStateMessage | ResultMessage) => void): () => void {
    this.#applicationListeners.push(listener);
    return () => undefined;
  }

  sendCommand(message: unknown): boolean {
    this.sent.push(message);
    return true;
  }

  emitStatus(connected: boolean): void {
    for (const listener of this.#statusListeners) {
      listener(this.status(connected));
    }
  }

  emitApplication(message: MeetingStateMessage | ResultMessage): void {
    for (const listener of this.#applicationListeners) {
      listener(message);
    }
  }

  private status(connected: boolean): BridgeStatus {
    return {
      type: "bridge.status",
      port: 53421,
      listening: true,
      paired: true,
      connected
    };
  }
}

function keyAction() {
  return {
    isKey: vi.fn(() => true),
    setImage: vi.fn(async () => undefined),
    setState: vi.fn(async () => undefined),
    setTitle: vi.fn(async () => undefined),
    showAlert: vi.fn(async () => undefined)
  };
}

const initialState: MeetingStateMessage = {
  v: 1,
  type: "state",
  meetingMultiplicity: "one",
  microphone: "off",
  camera: "on",
  hand: "lowered",
  selfPresentation: "inactive"
};

describe("confirmed Stream Deck state", () => {
  let bridge: FakeBridge;
  let coordinator: ActionCoordinator;
  let microphone: MicrophoneAction;
  let key: ReturnType<typeof keyAction>;

  beforeEach(() => {
    bridge = new FakeBridge();
    coordinator = new ActionCoordinator(bridge as unknown as BridgeServer);
    microphone = new MicrophoneAction(coordinator);
    coordinator.register(microphone);
    key = keyAction();
    (microphone.actions as unknown as unknown[]).push(key);
  });

  it("shows pending without optimistically toggling, then applies confirmed state", async () => {
    bridge.emitStatus(true);
    bridge.emitApplication(initialState);
    await vi.waitFor(() => expect(key.setState).toHaveBeenCalledWith(0));
    key.setImage.mockClear();
    key.setState.mockClear();

    await coordinator.trigger("microphone", key as unknown as KeyAction);

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]).toMatchObject({
      type: "command",
      action: "microphone.set",
      value: true
    });
    expect(key.setImage).toHaveBeenCalledWith("imgs/status/pending.svg");
    expect(key.setState).not.toHaveBeenCalled();

    const command = bridge.sent[0] as { id: string };
    bridge.emitApplication({ v: 1, type: "result", id: command.id, status: "ok" });
    expect(key.setState).not.toHaveBeenCalled();

    bridge.emitApplication({ ...initialState, microphone: "on" });
    await vi.waitFor(() => expect(key.setState).toHaveBeenCalledWith(1));
    expect(key.setImage).toHaveBeenLastCalledWith(undefined);
  });

  it("fails closed and alerts while the extension is offline", async () => {
    await coordinator.trigger("microphone", key as unknown as KeyAction);
    expect(bridge.sent).toHaveLength(0);
    expect(key.showAlert).toHaveBeenCalledOnce();
  });

  it("blocks ambiguous multi-meeting state", async () => {
    bridge.emitStatus(true);
    bridge.emitApplication({ ...initialState, meetingMultiplicity: "multiple" });
    await coordinator.trigger("microphone", key as unknown as KeyAction);
    expect(bridge.sent).toHaveLength(0);
    expect(key.showAlert).toHaveBeenCalledOnce();
  });

  it("renders confirmed state when a key appears", async () => {
    bridge.emitStatus(true);
    bridge.emitApplication(initialState);
    await coordinator.refreshAll();
    key.setImage.mockClear();
    key.setState.mockClear();
    key.setTitle.mockClear();

    await microphone.onWillAppear({ action: key } as unknown as WillAppearEvent);

    expect(key.setImage).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(key.setState).toHaveBeenCalledExactlyOnceWith(0);
    expect(key.setTitle).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it.each(["dial", "Neo Infobar"])("ignores %s appearances and refreshes", async (controller) => {
    const otherAction = {
      isKey: vi.fn(() => false),
      isDial: vi.fn(() => controller === "dial"),
      isNeoInfobar: vi.fn(() => controller === "Neo Infobar"),
      setTitle: vi.fn(async () => undefined),
      setFeedback: vi.fn(async () => undefined)
    };
    (microphone.actions as unknown as unknown[]).push(otherAction);

    await microphone.onWillAppear({ action: otherAction } as unknown as WillAppearEvent);
    await coordinator.refreshAll();

    expect(otherAction.isKey).toHaveBeenCalledTimes(2);
    expect(otherAction.setTitle).not.toHaveBeenCalled();
    expect(otherAction.setFeedback).not.toHaveBeenCalled();
    expect(key.setImage).toHaveBeenCalledWith("imgs/status/offline.svg");
    expect(key.setTitle).toHaveBeenCalledWith("Offline");
    expect(bridge.sent).toHaveLength(0);
  });

  it("temporarily shows the macOS Meet shortcut when presentation needs user action", async () => {
    vi.useFakeTimers();
    try {
      const presentation = new PresentationAction(coordinator);
      const presentationKey = keyAction();
      coordinator.register(presentation);
      (presentation.actions as unknown as unknown[]).push(presentationKey);

      bridge.emitStatus(true);
      bridge.emitApplication(initialState);
      await coordinator.refreshAll();

      await coordinator.trigger("presentation", presentationKey as unknown as KeyAction);
      const command = bridge.sent[0] as { id: string };
      bridge.emitApplication({
        v: 1,
        type: "result",
        id: command.id,
        status: "needs_user_action"
      });
      await coordinator.refreshAll();

      expect(presentationKey.showAlert).toHaveBeenCalledOnce();
      expect(presentationKey.setTitle).toHaveBeenLastCalledWith("⌃⌘T");
      expect(presentationKey.setState).toHaveBeenLastCalledWith(0);

      await vi.advanceTimersByTimeAsync(5_000);
      await coordinator.refreshAll();
      expect(presentationKey.setTitle).toHaveBeenLastCalledWith(undefined);
    } finally {
      vi.useRealTimers();
    }
  });
});
