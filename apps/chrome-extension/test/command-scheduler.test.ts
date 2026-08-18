import { describe, expect, it, vi } from "vitest";

import { ContentCommandScheduler } from "../src/content/command-scheduler";
import type { MeetCommand } from "../src/content/internal-protocol";

describe("ContentCommandScheduler", () => {
  it("never starts a queued same-control command after its worker deadline", async () => {
    let now = 100;
    let releaseFirst: (() => void) | undefined;
    const firstExecution = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const execute = vi.fn(async (command: MeetCommand) => {
      if (command.id === "first") {
        await firstExecution;
      }
      return "ok" as const;
    });
    const postResult = vi.fn();
    const scheduler = new ContentCommandScheduler({
      execute,
      now: () => now,
      onAfterExecution: vi.fn(),
      postResult
    });

    const first = scheduler.enqueue({
      command: { action: "microphone.set", id: "first", value: false },
      deadline: 500,
      kind: "meet.command"
    });
    const expired = scheduler.enqueue({
      command: { action: "microphone.set", id: "expired", value: true },
      deadline: 200,
      kind: "meet.command"
    });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    now = 250;
    releaseFirst?.();
    await Promise.all([first, expired]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(postResult).toHaveBeenCalledWith({
      id: "expired",
      kind: "meet.result",
      status: "timeout"
    });
  });

  it("does not globally block independent Meet controls", async () => {
    const releases = new Map<string, () => void>();
    const execute = vi.fn(
      (command: MeetCommand) =>
        new Promise<"ok">((resolve) => {
          releases.set(command.id, () => resolve("ok"));
        })
    );
    const scheduler = new ContentCommandScheduler({
      execute,
      now: () => 100,
      onAfterExecution: vi.fn(),
      postResult: vi.fn()
    });

    const microphone = scheduler.enqueue({
      command: { action: "microphone.set", id: "microphone", value: false },
      deadline: 500,
      kind: "meet.command"
    });
    const camera = scheduler.enqueue({
      command: { action: "camera.set", id: "camera", value: false },
      deadline: 500,
      kind: "meet.command"
    });
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(2));

    releases.get("microphone")?.();
    releases.get("camera")?.();
    await Promise.all([microphone, camera]);
  });
});
