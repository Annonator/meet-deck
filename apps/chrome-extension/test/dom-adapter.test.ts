// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { inspectMeetDom } from "../src/content/dom-adapter";
import { observeMeetDom } from "../src/content/dom-observer";
import {
  CURRENT_GERMAN_JOINED_FIXTURE,
  CURRENT_GERMAN_PRESENTING_FIXTURE,
  ENGLISH_JOINED_FIXTURE,
  GERMAN_PRESENTING_FIXTURE
} from "./fixtures/meet-dom";

describe("inspectMeetDom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("recognises a joined English Meet from exact accessibility controls", () => {
    document.body.innerHTML = ENGLISH_JOINED_FIXTURE;

    expect(inspectMeetDom().state).toEqual({
      camera: "off",
      hand: "lowered",
      joined: true,
      microphone: "on",
      selfPresentation: "inactive"
    });
  });

  it("recognises German controls and the user's own active presentation", () => {
    document.body.innerHTML = `${GERMAN_PRESENTING_FIXTURE}<button aria-label="Jetzt präsentieren"></button>`;

    expect(inspectMeetDom().state).toEqual({
      camera: "on",
      hand: "raised",
      joined: true,
      microphone: "off",
      selfPresentation: "active"
    });
  });

  it("recognises current German hand and screen-sharing accessibility labels", () => {
    document.body.innerHTML = CURRENT_GERMAN_JOINED_FIXTURE;

    expect(inspectMeetDom().state).toEqual({
      camera: "off",
      hand: "lowered",
      joined: true,
      microphone: "on",
      selfPresentation: "inactive"
    });
  });

  it("recognises the current self-presentation status before its stop menu is open", () => {
    document.body.innerHTML = CURRENT_GERMAN_PRESENTING_FIXTURE;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.selfPresentation).toBe("active");
    expect(snapshot.controls.presentationActive?.element.getAttribute("aria-label")).toBe(
      "Sie präsentieren"
    );
    expect(snapshot.controls.presentationStop).toBeUndefined();
  });

  it("recognises the English self-presentation status wording", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="You are presenting"></button>
    `;

    expect(inspectMeetDom().state.selfPresentation).toBe("active");
  });

  it("does not mistake another participant's presentation for the user's own", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Erika präsentiert"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.selfPresentation).toBe("unknown");
    expect(snapshot.controls.presentationActive).toBeUndefined();
  });

  it("uses aria-pressed when Meet keeps a stable hand label", () => {
    document.body.innerHTML = CURRENT_GERMAN_JOINED_FIXTURE.replace(
      'aria-pressed="false"',
      'aria-pressed="true"'
    );

    expect(inspectMeetDom().state.hand).toBe("raised");
  });

  it("publishes a new snapshot when only the hand pressed state changes", async () => {
    document.body.innerHTML = CURRENT_GERMAN_JOINED_FIXTURE;
    let hand = inspectMeetDom().state.hand;
    const observer = observeMeetDom(document.documentElement, () => {
      hand = inspectMeetDom().state.hand;
    });

    expect(hand).toBe("lowered");
    document.querySelector('[aria-label="Melden"]')?.setAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(hand).toBe("raised"));
    observer.disconnect();
  });

  it("recognises current English hand and screen-sharing accessibility labels", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Hand raise" aria-pressed="false"></button>
      <button aria-label="Share screen"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("lowered");
    expect(snapshot.state.selfPresentation).toBe("inactive");
  });

  it("fails closed on an invalid pressed state", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Melden" aria-pressed="mixed"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("unknown");
    expect(snapshot.controls.hand).toBeUndefined();
  });

  it("requires pressed state for a stable current hand label", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Melden"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("unknown");
    expect(snapshot.controls.hand).toBeUndefined();
  });

  it("prefers the pressed self toggle over a participant hand action", () => {
    document.body.innerHTML = `${CURRENT_GERMAN_JOINED_FIXTURE}
      <button aria-label="Meldung zurückziehen"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("lowered");
    expect(snapshot.controls.hand?.element.getAttribute("aria-label")).toBe("Melden");
  });

  it("fails closed with multiple pressed hand toggles", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Melden" aria-pressed="false"></button>
      <button aria-label="Hand raise" aria-pressed="false"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("unknown");
    expect(snapshot.controls.hand).toBeUndefined();
  });

  it("fails closed when a directional hand label contradicts pressed state", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Lower hand" aria-pressed="false"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.hand).toBe("unknown");
    expect(snapshot.controls.hand).toBeUndefined();
  });

  it("does not classify pre-join controls as a joined meeting", () => {
    document.body.innerHTML = `
      <button aria-label="Turn off microphone"></button>
      <button aria-label="Turn off camera"></button>
      <button aria-label="Join now"></button>
    `;

    expect(inspectMeetDom().state.joined).toBe(false);
  });

  it("fails closed when more than one candidate matches a control", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Turn off microphone"></button>
      <button aria-label="Turn on microphone"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.microphone).toBe("unknown");
    expect(snapshot.controls.microphone).toBeUndefined();
  });

  it("ignores participant controls and hidden duplicate controls", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <button aria-label="Turn off microphone"></button>
      <button aria-label="Turn on microphone" hidden></button>
      <button aria-label="Mute Erika Mustermann"></button>
    `;

    expect(inspectMeetDom().state.microphone).toBe("on");
  });

  it("ignores controls hidden or inert through an ancestor", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <div style="display: none"><button aria-label="Turn off microphone"></button></div>
      <div inert><button aria-label="Turn on camera"></button></div>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.microphone).toBe("unknown");
    expect(snapshot.state.camera).toBe("unknown");
  });

  it("publishes a new snapshot when an ancestor class hides a control", async () => {
    document.head.insertAdjacentHTML("beforeend", "<style>.meet-hidden { display: none }</style>");
    document.body.innerHTML = `
      <button aria-label="Leave call"></button>
      <div id="control-shell"><button aria-label="Turn off microphone"></button></div>
    `;
    let microphone = inspectMeetDom().state.microphone;
    const observer = observeMeetDom(document.documentElement, () => {
      microphone = inspectMeetDom().state.microphone;
    });

    expect(microphone).toBe("on");
    document.getElementById("control-shell")?.classList.add("meet-hidden");
    await vi.waitFor(() => expect(microphone).toBe("unknown"));
    observer.disconnect();
  });

  it("rejects labels with unrecognised descriptive suffixes", () => {
    document.body.innerHTML = `
      <button aria-label="Leave call for confidential-project"></button>
      <button aria-label="Turn off microphone for another participant"></button>
      <button aria-label="Turn on camera (for Erika)"></button>
      <button aria-label="Meldung zurückziehen von Erika"></button>
      <button aria-label="Bildschirm teilen mit Erika"></button>
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.joined).toBe(false);
    expect(snapshot.state.microphone).toBe("unknown");
    expect(snapshot.state.camera).toBe("unknown");
    expect(snapshot.state.hand).toBe("unknown");
    expect(snapshot.state.selfPresentation).toBe("unknown");
  });
});
