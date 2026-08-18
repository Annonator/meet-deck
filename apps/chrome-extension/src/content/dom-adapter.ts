import type {
  BinaryControlState,
  ContentMeetingState,
  HandState,
  SelfPresentationState
} from "./internal-protocol";

type ControlMeaning =
  | "camera.disable"
  | "camera.enable"
  | "hand.lower"
  | "hand.raise"
  | "leave"
  | "microphone.disable"
  | "microphone.enable"
  | "presentation.start"
  | "presentation.stop";

const LABELS: Readonly<Record<ControlMeaning, readonly string[]>> = Object.freeze({
  "camera.disable": ["Turn off camera", "Kamera deaktivieren", "Kamera ausschalten"],
  "camera.enable": ["Turn on camera", "Kamera aktivieren", "Kamera einschalten"],
  "hand.lower": ["Lower hand", "Hand senken"],
  "hand.raise": ["Raise hand", "Hand heben"],
  leave: ["Leave call", "Leave meeting", "Anruf beenden", "Anruf verlassen", "Meeting verlassen"],
  "microphone.disable": [
    "Turn off microphone",
    "Mute microphone",
    "Mikrofon deaktivieren",
    "Mikrofon ausschalten"
  ],
  "microphone.enable": [
    "Turn on microphone",
    "Unmute microphone",
    "Mikrofon aktivieren",
    "Mikrofon einschalten"
  ],
  "presentation.start": ["Present now", "Start presenting", "Jetzt präsentieren", "Präsentieren"],
  "presentation.stop": [
    "Stop presenting",
    "Stop sharing",
    "Präsentation beenden",
    "Freigabe beenden",
    "Teilen beenden"
  ]
});

const CONTROL_SELECTOR = "button[aria-label], [role='button'][aria-label]";
const SHORTCUT_SUFFIX =
  /^\s*\((?=[^)]*(?:⌘|⌃|⌥|⇧|\b(?:alt|control|ctrl|option|shift|strg|umschalt)\b))[\p{L}\p{N}\s+⌘⌃⌥⇧^.-]{1,40}\)\s*$/iu;

export interface MeetControl {
  readonly disabled: boolean;
  readonly element: HTMLElement;
}

export interface MeetDomSnapshot {
  readonly controls: {
    readonly camera?: MeetControl;
    readonly hand?: MeetControl;
    readonly microphone?: MeetControl;
    readonly presentationStart?: MeetControl;
    readonly presentationStop?: MeetControl;
  };
  readonly state: ContentMeetingState;
}

export function inspectMeetDom(root: ParentNode = document): MeetDomSnapshot {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(CONTROL_SELECTOR)).filter(
    isVisibleControl
  );
  const leaveControls = findControls(candidates, "leave");
  const microphone = readBinaryControl(candidates, "microphone.disable", "microphone.enable");
  const camera = readBinaryControl(candidates, "camera.disable", "camera.enable");
  const hand = readHandControl(candidates);
  const presentation = readPresentationControl(candidates);

  return {
    controls: {
      ...(camera.control === undefined ? {} : { camera: camera.control }),
      ...(hand.control === undefined ? {} : { hand: hand.control }),
      ...(microphone.control === undefined ? {} : { microphone: microphone.control }),
      ...(presentation.start === undefined ? {} : { presentationStart: presentation.start }),
      ...(presentation.stop === undefined ? {} : { presentationStop: presentation.stop })
    },
    state: {
      camera: camera.state,
      hand: hand.state,
      joined: leaveControls.length > 0,
      microphone: microphone.state,
      selfPresentation: presentation.state
    }
  };
}

function readBinaryControl(
  candidates: readonly HTMLElement[],
  disableMeaning: "camera.disable" | "microphone.disable",
  enableMeaning: "camera.enable" | "microphone.enable"
): { readonly control?: MeetControl; readonly state: BinaryControlState } {
  const disabling = findControls(candidates, disableMeaning);
  const enabling = findControls(candidates, enableMeaning);
  if (disabling.length + enabling.length !== 1) {
    return { state: "unknown" };
  }

  if (disabling.length === 1) {
    const element = disabling[0];
    return element === undefined
      ? { state: "unknown" }
      : { control: toControl(element), state: "on" };
  }

  const element = enabling[0];
  return element === undefined
    ? { state: "unknown" }
    : { control: toControl(element), state: "off" };
}

function readHandControl(candidates: readonly HTMLElement[]): {
  readonly control?: MeetControl;
  readonly state: HandState;
} {
  const lowering = findControls(candidates, "hand.lower");
  const raising = findControls(candidates, "hand.raise");
  if (lowering.length + raising.length !== 1) {
    return { state: "unknown" };
  }

  if (lowering.length === 1) {
    const element = lowering[0];
    return element === undefined
      ? { state: "unknown" }
      : { control: toControl(element), state: "raised" };
  }

  const element = raising[0];
  return element === undefined
    ? { state: "unknown" }
    : { control: toControl(element), state: "lowered" };
}

function readPresentationControl(candidates: readonly HTMLElement[]): {
  readonly start?: MeetControl;
  readonly state: SelfPresentationState;
  readonly stop?: MeetControl;
} {
  const starting = findControls(candidates, "presentation.start");
  const stopping = findControls(candidates, "presentation.stop");
  if (stopping.length === 1) {
    const element = stopping[0];
    return element === undefined
      ? { state: "unknown" }
      : { state: "active", stop: toControl(element) };
  }

  if (stopping.length > 1 || starting.length !== 1) {
    return { state: "unknown" };
  }

  const element = starting[0];
  return element === undefined
    ? { state: "unknown" }
    : { start: toControl(element), state: "inactive" };
}

function findControls(candidates: readonly HTMLElement[], meaning: ControlMeaning): HTMLElement[] {
  return candidates.filter((candidate) =>
    matchesMeaning(candidate.getAttribute("aria-label"), meaning)
  );
}

function matchesMeaning(rawLabel: string | null, meaning: ControlMeaning): boolean {
  if (rawLabel === null) {
    return false;
  }

  const normalized = rawLabel.normalize("NFKC").replace(/\s+/gu, " ").trim();
  return LABELS[meaning].some((label) => {
    if (normalized === label) {
      return true;
    }

    return normalized.startsWith(label) && SHORTCUT_SUFFIX.test(normalized.slice(label.length));
  });
}

function isVisibleControl(element: HTMLElement): boolean {
  if (!element.isConnected) {
    return false;
  }

  let current: HTMLElement | null = element;
  while (current !== null) {
    if (
      current.hidden ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse" ||
      style.opacity === "0" ||
      style.pointerEvents === "none"
    ) {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function toControl(element: HTMLElement): MeetControl {
  return {
    disabled:
      element.getAttribute("aria-disabled") === "true" ||
      (element instanceof HTMLButtonElement && element.disabled) ||
      isEffectivelyDisabled(element),
    element
  };
}

function isEffectivelyDisabled(element: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current !== null) {
    if (current.getAttribute("aria-disabled") === "true") {
      return true;
    }
    current = current.parentElement;
  }

  try {
    // :disabled includes controls disabled through an ancestor fieldset.
    return element.matches(":disabled");
  } catch {
    return true;
  }
}
