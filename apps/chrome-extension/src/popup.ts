import {
  isBridgePort,
  isExtensionResponse,
  normalizePairingCode,
  type BridgeProblem,
  type ExtensionError,
  type ExtensionRequest,
  type PublicBridgeStatus
} from "./shared/extension-messages";
import {
  removeLoopbackPermission,
  requestLoopbackPermission,
  type LoopbackPermissionRequestResult
} from "./shared/loopback-permission";
import { localizeDocument, localizeMessage } from "./ui/i18n";

localizeDocument();

const pairForm = requiredElement<HTMLFormElement>("pair-form");
const pairInput = requiredElement<HTMLInputElement>("pair-code");
const pairButton = requiredElement<HTMLButtonElement>("pair-button");
const connectButton = requiredElement<HTMLButtonElement>("connect-button");
const portForm = requiredElement<HTMLFormElement>("port-form");
const portInput = requiredElement<HTMLInputElement>("bridge-port");
const portSaveButton = requiredElement<HTMLButtonElement>("port-save-button");
const forgetButton = requiredElement<HTMLButtonElement>("forget-button");
const connectionStatus = requiredElement<HTMLElement>("connection-status");
const meetingStatus = requiredElement<HTMLElement>("meeting-status");
const statusDot = requiredElement<HTMLElement>("status-dot");
const errorMessage = requiredElement<HTMLElement>("form-error");

let currentStatus: PublicBridgeStatus | undefined;

setUiReady(false);

pairForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void pair();
});

connectButton.addEventListener("click", () => {
  void connectStoredPairing();
});

portForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void savePort();
});

forgetButton.addEventListener("click", () => {
  void forgetPairing();
});

void refresh();

async function refresh(): Promise<void> {
  const response = await request({ kind: "bridge.status.get" });
  if (response === undefined) {
    showError(
      message(
        "error_background_unavailable",
        "Meet Deck's background service is unavailable. Reload the extension."
      )
    );
    return;
  }
  renderStatus(response.status);
  if (!response.ok) {
    showError(extensionErrorText(response.error));
    return;
  }
  setUiReady(true);
}

async function pair(): Promise<void> {
  clearError();
  const code = normalizePairingCode(pairInput.value);
  if (code === undefined) {
    showError(
      message(
        "error_invalid_pairing_code",
        "Enter the eight-digit code from the Stream Deck Property Inspector."
      )
    );
    pairInput.focus();
    return;
  }

  const port = readPort();
  if (port === undefined) {
    showInvalidPort();
    portInput.focus();
    return;
  }

  // Keep this call before the first await: Chrome requires the optional host
  // request to remain directly attributable to the form submission gesture.
  const permissionRequest = requestLoopbackPermission(port);
  setPairBusy(true);
  const permission = await permissionRequest;
  if (permission !== "granted") {
    setPairBusy(false);
    showPermissionFailure(permission);
    return;
  }

  const oldPort = currentStatus?.port;
  const portResponse = await request({ kind: "bridge.port.set", port });
  if (portResponse === undefined) {
    setPairBusy(false);
    showError(message("error_port_save_failed", "The port could not be saved."));
    return;
  }
  renderStatus(portResponse.status);
  if (!portResponse.ok) {
    setPairBusy(false);
    showError(extensionErrorText(portResponse.error));
    return;
  }

  const cleanupFailed = await removeSupersededPermission(oldPort, port);
  const response = await request({ code, kind: "bridge.pair" });
  setPairBusy(false);
  if (response === undefined) {
    showError(message("error_bridge_message_failed", "The local bridge could not be reached."));
    return;
  }

  renderStatus(response.status);
  if (!response.ok) {
    showError(extensionErrorText(response.error));
  } else {
    pairInput.value = "";
    if (cleanupFailed) {
      showPermissionCleanupFailure();
    }
  }
}

async function connectStoredPairing(): Promise<void> {
  clearError();
  const port = readPort();
  if (port === undefined) {
    showInvalidPort();
    portInput.focus();
    return;
  }

  // Keep this call before the first await for the same user-gesture guarantee
  // as initial pairing. Already-active grants resolve true without a new prompt.
  const permissionRequest = requestLoopbackPermission(port);
  setConnectBusy(true);
  const permission = await permissionRequest;
  if (permission !== "granted") {
    setConnectBusy(false);
    showPermissionFailure(permission);
    return;
  }

  const oldPort = currentStatus?.port;
  const portResponse = await request({ kind: "bridge.port.set", port });
  if (portResponse === undefined) {
    setConnectBusy(false);
    showError(message("error_port_save_failed", "The port could not be saved."));
    return;
  }
  renderStatus(portResponse.status);
  if (!portResponse.ok) {
    setConnectBusy(false);
    showError(extensionErrorText(portResponse.error));
    return;
  }

  const cleanupFailed = await removeSupersededPermission(oldPort, port);
  const response = await request({ kind: "bridge.connect" });
  setConnectBusy(false);
  if (response === undefined) {
    showError(message("error_bridge_message_failed", "The local bridge could not be reached."));
    return;
  }

  renderStatus(response.status);
  if (!response.ok) {
    showError(extensionErrorText(response.error));
  } else if (cleanupFailed) {
    showPermissionCleanupFailure();
  }
}

async function savePort(): Promise<void> {
  clearError();
  const port = readPort();
  if (port === undefined) {
    showInvalidPort();
    portInput.focus();
    return;
  }

  const oldPort = currentStatus?.port;
  const response = await request({ kind: "bridge.port.set", port });
  if (response === undefined) {
    showError(message("error_port_save_failed", "The port could not be saved."));
    return;
  }
  renderStatus(response.status);
  if (!response.ok) {
    showError(extensionErrorText(response.error));
    return;
  }

  if (await removeSupersededPermission(oldPort, port)) {
    showPermissionCleanupFailure();
  }
}

async function forgetPairing(): Promise<void> {
  clearError();
  const response = await request({ kind: "bridge.pair.forget" });
  if (response === undefined) {
    showError(message("error_forget_failed", "The pairing could not be removed."));
    return;
  }
  renderStatus(response.status);
  if (!response.ok) {
    showError(extensionErrorText(response.error));
    return;
  }

  const removal = await removeLoopbackPermission(response.status.port);
  if (removal === "unavailable") {
    showPermissionCleanupFailure();
  }
}

async function removeSupersededPermission(
  oldPort: number | undefined,
  currentPort: number
): Promise<boolean> {
  if (oldPort === undefined || oldPort === currentPort) {
    return false;
  }
  return (await removeLoopbackPermission(oldPort)) === "unavailable";
}

async function request(messageValue: ExtensionRequest) {
  try {
    const response: unknown = await chrome.runtime.sendMessage(messageValue);
    return isExtensionResponse(response) ? response : undefined;
  } catch {
    return undefined;
  }
}

function renderStatus(status: PublicBridgeStatus): void {
  currentStatus = status;
  portInput.value = String(status.port);
  statusDot.className = "status-dot";

  const requiresNewPairingCode =
    !status.paired ||
    status.problem === "authentication_failed" ||
    status.problem === "invalid_pairing_code" ||
    status.problem === "pairing_expired";
  pairForm.hidden = !requiresNewPairingCode;
  connectButton.hidden =
    !status.paired || requiresNewPairingCode || status.connection !== "disconnected";

  if (status.authentication === "authenticated" && status.connection === "connected") {
    statusDot.classList.add("status-dot--online");
    connectionStatus.textContent = message(
      "connection_connected",
      "Securely connected to Stream Deck"
    );
  } else if (status.connection === "connecting" || status.authentication === "pairing") {
    statusDot.classList.add("status-dot--busy");
    connectionStatus.textContent = message(
      "connection_connecting",
      "Connecting to the local bridge…"
    );
  } else {
    statusDot.classList.add("status-dot--offline");
    connectionStatus.textContent =
      status.authentication === "unpaired"
        ? message("connection_unpaired", "Not paired yet")
        : message("connection_bridge_unavailable", "Local bridge unavailable");
  }

  meetingStatus.textContent =
    status.meetingMultiplicity === "one"
      ? message("meeting_one", "One active meeting can be controlled.")
      : status.meetingMultiplicity === "multiple"
        ? message(
            "meeting_multiple",
            "Multiple active meetings detected—control is safely blocked."
          )
        : message("meeting_none", "No controllable meeting detected.");

  if (status.problem !== undefined) {
    showError(problemText(status.problem));
  } else {
    clearError();
  }
}

function problemText(problem: BridgeProblem): string {
  switch (problem) {
    case "authentication_failed":
      return message(
        "problem_authentication_failed",
        "Mutual authentication failed. Pair both sides again."
      );
    case "bridge_unavailable":
      return message(
        "problem_bridge_unavailable",
        "The local bridge is unavailable. Is the Stream Deck app running?"
      );
    case "invalid_pairing_code":
      return message("problem_invalid_pairing_code", "The pairing code is invalid.");
    case "loopback_permission_denied":
      return message(
        "problem_loopback_permission_denied",
        "Chrome denied Meet Deck access to the configured loopback address. Choose Pair or Connect to request it again."
      );
    case "loopback_permission_required":
      return message(
        "problem_loopback_permission_required",
        "Chrome needs your approval before Meet Deck can reach the configured loopback address. Choose Pair or Connect to continue."
      );
    case "pairing_expired":
      return message(
        "problem_pairing_expired",
        "The pairing code has expired. Generate a new one in the Property Inspector."
      );
    case "protocol_error":
      return message(
        "problem_protocol_error",
        "The bridge sent unexpected data. The connection was closed as a precaution."
      );
  }
}

function extensionErrorText(error: ExtensionError): string {
  switch (error) {
    case "not_paired":
      return message(
        "error_not_paired",
        "Meet Deck is not paired yet. Open pairing in Stream Deck and enter the displayed code."
      );
    case "request_failed":
      return message("error_request_failed", "The local extension request failed.");
    case "secure_storage_unavailable":
      return message(
        "error_secure_storage_unavailable",
        "Chrome could not restrict the Meet Deck pairing credential to trusted extension contexts."
      );
    default:
      return problemText(error);
  }
}

function showPermissionFailure(result: Exclude<LoopbackPermissionRequestResult, "granted">): void {
  if (result === "invalid") {
    showInvalidPort();
    return;
  }
  showError(
    result === "denied"
      ? message(
          "error_loopback_permission_denied",
          "Chrome denied access to the configured loopback address. Choose Pair or Connect to request it again, or review Meet Deck's optional loopback host access in chrome://extensions."
        )
      : message(
          "error_loopback_permission_request_failed",
          "Chrome could not complete the loopback permission request. Keep the popup open and try again."
        )
  );
}

function showInvalidPort(): void {
  showError(
    message("error_invalid_bridge_port", "Enter a local bridge port from 1024 through 65535.")
  );
}

function showPermissionCleanupFailure(): void {
  showError(
    message(
      "error_permission_cleanup_failed",
      "Meet Deck changed the local connection, but Chrome could not remove the previous loopback permission. Review Meet Deck's optional loopback host access in chrome://extensions."
    )
  );
}

function setPairBusy(busy: boolean): void {
  pairButton.disabled = busy;
  pairButton.textContent = busy
    ? message("popup_pair_button_connecting", "Pairing and connecting…")
    : message("popup_pair_button_default", "Pair and connect");
}

function setConnectBusy(busy: boolean): void {
  connectButton.disabled = busy;
  connectButton.textContent = busy
    ? message("popup_connect_button_connecting", "Connecting…")
    : message("popup_connect_button_default", "Connect");
}

function setUiReady(ready: boolean): void {
  for (const control of [
    pairInput,
    pairButton,
    connectButton,
    portInput,
    portSaveButton,
    forgetButton
  ]) {
    control.disabled = !ready;
  }
}

function readPort(): number | undefined {
  const port = Number(portInput.value);
  return isBridgePort(port) ? port : undefined;
}

function showError(messageValue: string): void {
  errorMessage.textContent = messageValue;
  errorMessage.hidden = false;
}

function clearError(): void {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function message(key: string, englishFallback: string): string {
  return localizeMessage(key, englishFallback);
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing extension UI element: ${id}`);
  }
  return element as T;
}
