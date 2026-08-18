import { inspectMeetDom, type MeetControl, type MeetDomSnapshot } from "./dom-adapter";
import type { ContentResultStatus, MeetCommand } from "./internal-protocol";

const CONFIRMATION_TIMEOUT_MS = 3_000;
const PRESENTATION_START_WAIT_MS = 800;
const POLL_INTERVAL_MS = 50;

export async function executeMeetCommand(
  command: MeetCommand,
  root: ParentNode = document
): Promise<ContentResultStatus> {
  const initial = inspectMeetDom(root);
  if (!initial.state.joined) {
    return "no_meeting";
  }

  switch (command.action) {
    case "microphone.set":
      return executeBinaryControl(
        command.value,
        initial.state.microphone,
        initial.controls.microphone,
        "microphone",
        root
      );
    case "camera.set":
      return executeBinaryControl(
        command.value,
        initial.state.camera,
        initial.controls.camera,
        "camera",
        root
      );
    case "hand.set":
      return executeHandControl(command.value, initial, root);
    case "presentation.start":
      return startPresentation(initial, root);
    case "presentation.stop":
      return stopPresentation(initial, root);
  }
}

async function executeBinaryControl(
  desired: boolean,
  current: "off" | "on" | "unknown",
  control: MeetControl | undefined,
  field: "camera" | "microphone",
  root: ParentNode
): Promise<ContentResultStatus> {
  const desiredState = desired ? "on" : "off";
  if (current === desiredState) {
    return "noop";
  }
  if (current === "unknown" || control === undefined) {
    return "unsupported_ui";
  }
  if (control.disabled) {
    return "blocked";
  }

  const latest = inspectMeetDom(root);
  const latestState = latest.state[field];
  if (latestState === desiredState) {
    return "noop";
  }
  const latestControl = latest.controls[field];
  if (
    latestState !== current ||
    latestControl === undefined ||
    latestControl.element !== control.element
  ) {
    return "unsupported_ui";
  }
  if (latestControl.disabled) {
    return "blocked";
  }

  latestControl.element.click();
  const confirmed = await waitUntil(
    () => inspectMeetDom(root).state[field] === desiredState,
    CONFIRMATION_TIMEOUT_MS
  );
  return confirmed ? "ok" : "timeout";
}

async function executeHandControl(
  desired: boolean,
  initial: MeetDomSnapshot,
  root: ParentNode
): Promise<ContentResultStatus> {
  const desiredState = desired ? "raised" : "lowered";
  if (initial.state.hand === desiredState) {
    return "noop";
  }
  if (initial.state.hand === "unknown" || initial.controls.hand === undefined) {
    return "unsupported_ui";
  }
  if (initial.controls.hand.disabled) {
    return "blocked";
  }

  const latest = inspectMeetDom(root);
  if (latest.state.hand === desiredState) {
    return "noop";
  }
  if (
    latest.state.hand !== initial.state.hand ||
    latest.controls.hand === undefined ||
    latest.controls.hand.element !== initial.controls.hand.element
  ) {
    return "unsupported_ui";
  }
  if (latest.controls.hand.disabled) {
    return "blocked";
  }

  latest.controls.hand.element.click();
  const confirmed = await waitUntil(
    () => inspectMeetDom(root).state.hand === desiredState,
    CONFIRMATION_TIMEOUT_MS
  );
  return confirmed ? "ok" : "timeout";
}

async function startPresentation(
  initial: MeetDomSnapshot,
  root: ParentNode
): Promise<ContentResultStatus> {
  if (initial.state.selfPresentation === "active") {
    return "noop";
  }
  if (
    initial.state.selfPresentation !== "inactive" ||
    initial.controls.presentationStart === undefined
  ) {
    return "unsupported_ui";
  }
  if (initial.controls.presentationStart.disabled) {
    return "blocked";
  }

  const latest = inspectMeetDom(root);
  if (latest.state.selfPresentation === "active") {
    return "noop";
  }
  if (
    latest.state.selfPresentation !== "inactive" ||
    latest.controls.presentationStart === undefined ||
    latest.controls.presentationStart.element !== initial.controls.presentationStart.element
  ) {
    return "unsupported_ui";
  }
  if (latest.controls.presentationStart.disabled) {
    return "blocked";
  }

  latest.controls.presentationStart.element.click();
  const confirmed = await waitUntil(
    () => inspectMeetDom(root).state.selfPresentation === "active",
    PRESENTATION_START_WAIT_MS
  );
  return confirmed ? "ok" : "needs_user_action";
}

async function stopPresentation(
  initial: MeetDomSnapshot,
  root: ParentNode
): Promise<ContentResultStatus> {
  if (initial.state.selfPresentation === "inactive") {
    return "noop";
  }
  if (
    initial.state.selfPresentation !== "active" ||
    initial.controls.presentationStop === undefined
  ) {
    return "unsupported_ui";
  }
  if (initial.controls.presentationStop.disabled) {
    return "blocked";
  }

  const latest = inspectMeetDom(root);
  if (latest.state.selfPresentation === "inactive") {
    return "noop";
  }
  if (
    latest.state.selfPresentation !== "active" ||
    latest.controls.presentationStop === undefined ||
    latest.controls.presentationStop.element !== initial.controls.presentationStop.element
  ) {
    return "unsupported_ui";
  }
  if (latest.controls.presentationStop.disabled) {
    return "blocked";
  }

  latest.controls.presentationStop.element.click();
  const confirmed = await waitUntil(
    () => inspectMeetDom(root).state.selfPresentation === "inactive",
    CONFIRMATION_TIMEOUT_MS
  );
  return confirmed ? "ok" : "timeout";
}

async function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return predicate();
}
