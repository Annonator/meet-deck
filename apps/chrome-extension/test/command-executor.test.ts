// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeMeetCommand } from "../src/content/command-executor";

describe("executeMeetCommand", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button aria-label="Leave call"></button>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns noop without clicking when the requested state is already confirmed", async () => {
    const microphone = document.createElement("button");
    microphone.ariaLabel = "Turn off microphone";
    const click = vi.fn();
    microphone.addEventListener("click", click);
    document.body.append(microphone);

    await expect(
      executeMeetCommand({ action: "microphone.set", id: "command-1", value: true })
    ).resolves.toBe("noop");
    expect(click).not.toHaveBeenCalled();
  });

  it("waits for Meet to confirm a microphone state change", async () => {
    const microphone = document.createElement("button");
    microphone.ariaLabel = "Turn on microphone";
    microphone.addEventListener("click", () => {
      microphone.ariaLabel = "Turn off microphone";
    });
    document.body.append(microphone);

    await expect(
      executeMeetCommand({ action: "microphone.set", id: "command-2", value: true })
    ).resolves.toBe("ok");
  });

  it("does not click disabled Meet controls", async () => {
    const camera = document.createElement("button");
    camera.ariaLabel = "Turn on camera";
    camera.disabled = true;
    const click = vi.fn();
    camera.addEventListener("click", click);
    document.body.append(camera);

    await expect(
      executeMeetCommand({ action: "camera.set", id: "command-3", value: true })
    ).resolves.toBe("blocked");
    expect(click).not.toHaveBeenCalled();
  });

  it("does not click a control effectively disabled by an ancestor fieldset", async () => {
    const fieldset = document.createElement("fieldset");
    fieldset.disabled = true;
    const microphone = document.createElement("button");
    microphone.ariaLabel = "Turn on microphone";
    const click = vi.fn();
    microphone.addEventListener("click", click);
    fieldset.append(microphone);
    document.body.append(fieldset);

    await expect(
      executeMeetCommand({ action: "microphone.set", id: "fieldset-disabled", value: true })
    ).resolves.toBe("blocked");
    expect(click).not.toHaveBeenCalled();
  });

  it("does not click a role control disabled through an ARIA ancestor", async () => {
    const disabledRegion = document.createElement("div");
    disabledRegion.setAttribute("aria-disabled", "true");
    const camera = document.createElement("div");
    camera.setAttribute("role", "button");
    camera.ariaLabel = "Turn on camera";
    const click = vi.fn();
    camera.addEventListener("click", click);
    disabledRegion.append(camera);
    document.body.append(disabledRegion);

    await expect(
      executeMeetCommand({ action: "camera.set", id: "aria-ancestor-disabled", value: true })
    ).resolves.toBe("blocked");
    expect(click).not.toHaveBeenCalled();
  });

  it("does not click a control node replaced between lookup and revalidation", async () => {
    const microphone = document.createElement("button");
    microphone.ariaLabel = "Turn on microphone";
    const replacement = document.createElement("button");
    replacement.ariaLabel = "Turn on microphone";
    const oldClick = vi.fn();
    const replacementClick = vi.fn();
    microphone.addEventListener("click", oldClick);
    replacement.addEventListener("click", replacementClick);
    document.body.append(microphone);

    const getAttribute = microphone.getAttribute.bind(microphone);
    let replaced = false;
    vi.spyOn(microphone, "getAttribute").mockImplementation((name) => {
      const value = getAttribute(name);
      if (name === "aria-disabled" && !replaced) {
        replaced = true;
        microphone.replaceWith(replacement);
      }
      return value;
    });

    await expect(
      executeMeetCommand({ action: "microphone.set", id: "command-replaced", value: true })
    ).resolves.toBe("unsupported_ui");
    expect(oldClick).not.toHaveBeenCalled();
    expect(replacementClick).not.toHaveBeenCalled();
  });

  it("raises a hand through the current stable German accessibility label", async () => {
    const hand = document.createElement("button");
    hand.ariaLabel = "Melden";
    hand.setAttribute("aria-pressed", "false");
    const click = vi.fn(() => hand.setAttribute("aria-pressed", "true"));
    hand.addEventListener("click", click);
    document.body.append(hand);

    await expect(
      executeMeetCommand({ action: "hand.set", id: "hand-current-label", value: true })
    ).resolves.toBe("ok");
    expect(click).toHaveBeenCalledOnce();
  });

  it("lowers a hand through the current stable German accessibility label", async () => {
    const hand = document.createElement("button");
    hand.ariaLabel = "Melden";
    hand.setAttribute("aria-pressed", "true");
    const click = vi.fn(() => hand.setAttribute("aria-pressed", "false"));
    hand.addEventListener("click", click);
    document.body.append(hand);

    await expect(
      executeMeetCommand({ action: "hand.set", id: "hand-current-label-lower", value: false })
    ).resolves.toBe("ok");
    expect(click).toHaveBeenCalledOnce();
  });

  it("requires explicit user action when starting a presentation is not confirmed", async () => {
    vi.useFakeTimers();
    const present = document.createElement("button");
    present.ariaLabel = "Present now";
    document.body.append(present);

    const outcome = executeMeetCommand({ action: "presentation.start", id: "command-4" });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(outcome).resolves.toBe("needs_user_action");
  });

  it("opens presentation flow through the current screen-sharing label", async () => {
    vi.useFakeTimers();
    const present = document.createElement("button");
    present.ariaLabel = "Bildschirm teilen";
    const click = vi.fn();
    present.addEventListener("click", click);
    document.body.append(present);

    const outcome = executeMeetCommand({
      action: "presentation.start",
      id: "presentation-current-label"
    });
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(outcome).resolves.toBe("needs_user_action");
    expect(click).toHaveBeenCalledOnce();
  });

  it("confirms stopping the user's own presentation", async () => {
    const stop = document.createElement("button");
    stop.ariaLabel = "Stop presenting";
    stop.addEventListener("click", () => {
      stop.ariaLabel = "Present now";
    });
    document.body.append(stop);

    await expect(
      executeMeetCommand({ action: "presentation.stop", id: "command-5" })
    ).resolves.toBe("ok");
  });

  it("opens the current presentation status menu before stopping", async () => {
    const presentationStatus = document.createElement("button");
    presentationStatus.ariaLabel = "Sie präsentieren";
    const openMenu = vi.fn(() => {
      const stop = document.createElement("div");
      stop.setAttribute("role", "menuitem");
      stop.ariaLabel = "Präsentation beenden";
      stop.addEventListener("click", () => {
        presentationStatus.ariaLabel = "Bildschirm teilen";
        stop.remove();
      });
      document.body.append(stop);
    });
    presentationStatus.addEventListener("click", openMenu);
    document.body.append(presentationStatus);

    await expect(
      executeMeetCommand({ action: "presentation.stop", id: "presentation-current-menu" })
    ).resolves.toBe("ok");
    expect(openMenu).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-label="Präsentation beenden"]')).toBeNull();
  });

  it("refuses to act before the user has joined", async () => {
    document.body.innerHTML = '<button aria-label="Turn on microphone"></button>';

    await expect(
      executeMeetCommand({ action: "microphone.set", id: "command-6", value: true })
    ).resolves.toBe("no_meeting");
  });
});
