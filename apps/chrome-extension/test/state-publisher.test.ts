import { describe, expect, it, vi } from "vitest";

import { ContentStatePublisher } from "../src/content/state-publisher";
import type { ContentMeetingState } from "../src/content/internal-protocol";

const STATE: ContentMeetingState = {
  camera: "off",
  hand: "lowered",
  joined: true,
  microphone: "on",
  selfPresentation: "inactive"
};

describe("ContentStatePublisher", () => {
  it("resends unchanged state after the service-worker port reconnects", () => {
    const publisher = new ContentStatePublisher();
    const firstPort = vi.fn();
    const secondPort = vi.fn();

    publisher.connect(firstPort);
    expect(publisher.publish(STATE)).toBe(true);
    expect(publisher.publish(STATE)).toBe(false);
    publisher.disconnect();
    publisher.connect(secondPort);
    expect(publisher.publish(STATE)).toBe(true);

    expect(firstPort).toHaveBeenCalledWith({ kind: "meet.state", revision: 1, state: STATE });
    expect(secondPort).toHaveBeenCalledWith({ kind: "meet.state", revision: 2, state: STATE });
  });

  it("does not cache a state that a disconnected port failed to receive", () => {
    const publisher = new ContentStatePublisher();
    publisher.connect(() => {
      throw new Error("disconnected");
    });
    expect(publisher.publish(STATE)).toBe(false);

    const reconnectedPort = vi.fn();
    publisher.connect(reconnectedPort);
    expect(publisher.publish(STATE)).toBe(true);
    expect(reconnectedPort).toHaveBeenCalledWith({ kind: "meet.state", revision: 1, state: STATE });
  });
});
