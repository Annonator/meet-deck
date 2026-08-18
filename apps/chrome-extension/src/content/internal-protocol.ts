export const CONTENT_PORT_NAME = "meet-deck-content-v1";

export type BinaryControlState = "off" | "on" | "unknown";
export type HandState = "lowered" | "raised" | "unknown";
export type SelfPresentationState = "active" | "inactive" | "unknown";

export interface ContentMeetingState {
  readonly camera: BinaryControlState;
  readonly hand: HandState;
  readonly joined: boolean;
  readonly microphone: BinaryControlState;
  readonly selfPresentation: SelfPresentationState;
}

export type ContentToWorkerMessage =
  | {
      readonly kind: "meet.state";
      readonly revision: number;
      readonly state: ContentMeetingState;
    }
  | {
      readonly id: string;
      readonly kind: "meet.result";
      readonly status: ContentResultStatus;
    };

export type ContentResultStatus =
  "blocked" | "needs_user_action" | "no_meeting" | "noop" | "ok" | "timeout" | "unsupported_ui";

export type MeetCommand =
  | { readonly action: "camera.set"; readonly id: string; readonly value: boolean }
  | { readonly action: "hand.set"; readonly id: string; readonly value: boolean }
  | { readonly action: "microphone.set"; readonly id: string; readonly value: boolean }
  | { readonly action: "presentation.start"; readonly id: string }
  | { readonly action: "presentation.stop"; readonly id: string };

export interface WorkerToContentMessage {
  readonly command: MeetCommand;
  readonly deadline: number;
  readonly kind: "meet.command";
}

export function isContentToWorkerMessage(value: unknown): value is ContentToWorkerMessage {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "meet.state") {
    return (
      Object.keys(value).length === 3 &&
      Number.isSafeInteger(value.revision) &&
      Number(value.revision) >= 1 &&
      isContentMeetingState(value.state)
    );
  }

  return (
    value.kind === "meet.result" &&
    Object.keys(value).length === 3 &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.id.length <= 128 &&
    [
      "blocked",
      "needs_user_action",
      "no_meeting",
      "noop",
      "ok",
      "timeout",
      "unsupported_ui"
    ].includes(String(value.status))
  );
}

export function isWorkerToContentMessage(value: unknown): value is WorkerToContentMessage {
  return (
    isRecord(value) &&
    Object.keys(value).length === 3 &&
    value.kind === "meet.command" &&
    Number.isSafeInteger(value.deadline) &&
    Number(value.deadline) > 0 &&
    isMeetCommand(value.command)
  );
}

function isContentMeetingState(value: unknown): value is ContentMeetingState {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !["camera", "hand", "joined", "microphone", "selfPresentation"].includes(key)
    )
  ) {
    return false;
  }

  return (
    typeof value.joined === "boolean" &&
    ["off", "on", "unknown"].includes(String(value.microphone)) &&
    ["off", "on", "unknown"].includes(String(value.camera)) &&
    ["lowered", "raised", "unknown"].includes(String(value.hand)) &&
    ["active", "inactive", "unknown"].includes(String(value.selfPresentation))
  );
}

function isMeetCommand(value: unknown): value is MeetCommand {
  if (
    !isRecord(value) ||
    typeof value.action !== "string" ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128
  ) {
    return false;
  }

  if (["camera.set", "hand.set", "microphone.set"].includes(value.action)) {
    return Object.keys(value).length === 3 && typeof value.value === "boolean";
  }

  return (
    ["presentation.start", "presentation.stop"].includes(value.action) &&
    Object.keys(value).length === 2
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
