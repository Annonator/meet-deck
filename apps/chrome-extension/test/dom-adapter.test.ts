// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { inspectMeetDom } from "../src/content/dom-adapter";
import { observeMeetDom } from "../src/content/dom-observer";
import { ENGLISH_JOINED_FIXTURE, GERMAN_PRESENTING_FIXTURE } from "./fixtures/meet-dom";

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
    `;

    const snapshot = inspectMeetDom();
    expect(snapshot.state.joined).toBe(false);
    expect(snapshot.state.microphone).toBe("unknown");
    expect(snapshot.state.camera).toBe("unknown");
  });
});
