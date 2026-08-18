import { describe, expect, it } from "vitest";

import { TabRegistry } from "../src/bridge/tab-registry";
import type { ContentMeetingState } from "../src/content/internal-protocol";

const JOINED_STATE: ContentMeetingState = {
  camera: "off",
  hand: "lowered",
  joined: true,
  microphone: "on",
  selfPresentation: "inactive"
};

describe("TabRegistry", () => {
  it("reports no meeting until a top-level document confirms it joined", () => {
    const registry = new TabRegistry();
    registry.register("document-a", 1, 10);

    expect(registry.aggregate().meetingMultiplicity).toBe("none");
    expect(registry.singleJoinedDocument()).toBeUndefined();
  });

  it("projects only privacy-minimised control state for one joined document", () => {
    const registry = new TabRegistry();
    registry.register("document-a", 1, 10);
    expect(registry.update("document-a", 1, JOINED_STATE)).toBe(true);

    expect(registry.aggregate()).toEqual({
      v: 1,
      type: "state",
      meetingMultiplicity: "one",
      camera: "off",
      hand: "lowered",
      microphone: "on",
      selfPresentation: "inactive"
    });
    expect(registry.singleJoinedDocument()).toEqual({
      documentId: "document-a",
      tabId: 1,
      windowId: 10
    });
  });

  it("blocks targeting and hides individual state when two meetings are joined", () => {
    const registry = new TabRegistry();
    registry.register("document-a", 1, 10);
    registry.register("document-b", 2, 10);
    registry.update("document-a", 1, JOINED_STATE);
    registry.update("document-b", 1, JOINED_STATE);

    expect(registry.aggregate()).toMatchObject({
      meetingMultiplicity: "multiple",
      camera: "unknown",
      microphone: "unknown"
    });
    expect(registry.singleJoinedDocument()).toBeUndefined();
  });

  it("ignores replayed or out-of-order document revisions", () => {
    const registry = new TabRegistry();
    registry.register("document-a", 1, 10);
    expect(registry.update("document-a", 2, JOINED_STATE)).toBe(true);
    expect(registry.update("document-a", 1, { ...JOINED_STATE, microphone: "off" })).toBe(false);
    expect(registry.aggregate().microphone).toBe("on");
  });

  it("replaces a stale SPA document registered for the same tab", () => {
    const registry = new TabRegistry();
    registry.register("document-old", 1, 10);
    registry.update("document-old", 1, JOINED_STATE);
    registry.register("document-new", 1, 10);

    expect(registry.update("document-old", 2, JOINED_STATE)).toBe(false);
    expect(registry.aggregate().meetingMultiplicity).toBe("none");
  });

  it("blocks a confirmed meeting while another connected document has not reported state", () => {
    const registry = new TabRegistry();
    registry.register("document-a", 1, 10);
    registry.update("document-a", 1, JOINED_STATE);
    registry.register("document-b", 2, 10);

    expect(registry.aggregate()).toMatchObject({
      meetingMultiplicity: "multiple",
      microphone: "unknown"
    });
    expect(registry.singleJoinedDocument()).toBeUndefined();
  });
});
