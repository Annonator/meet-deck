import {
  isExtensionResponse,
  normalizePairingCode,
  type ExtensionRequest,
  type PublicBridgeStatus
} from "./shared/extension-messages";
import { bootstrapLocalNetworkAccess } from "./popup/local-network";

const pairForm = requiredElement<HTMLFormElement>("pair-form");
const pairInput = requiredElement<HTMLInputElement>("pair-code");
const pairButton = requiredElement<HTMLButtonElement>("pair-button");
const portForm = requiredElement<HTMLFormElement>("port-form");
const portInput = requiredElement<HTMLInputElement>("bridge-port");
const forgetButton = requiredElement<HTMLButtonElement>("forget-button");
const connectionStatus = requiredElement<HTMLElement>("connection-status");
const meetingStatus = requiredElement<HTMLElement>("meeting-status");
const statusDot = requiredElement<HTMLElement>("status-dot");
const errorMessage = requiredElement<HTMLElement>("form-error");

pairForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void pair();
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
    showError("Der Meet-Deck-Hintergrunddienst ist nicht erreichbar. Lade die Extension neu.");
    return;
  }
  renderStatus(response.status);
}

async function pair(): Promise<void> {
  clearError();
  const code = normalizePairingCode(pairInput.value);
  if (code === undefined) {
    showError("Bitte gib den achtstelligen Code aus dem Stream-Deck-Property-Inspector ein.");
    pairInput.focus();
    return;
  }

  pairButton.disabled = true;
  pairButton.textContent = "Verbinde …";
  const localNetwork = await bootstrapLocalNetworkAccess(Number(portInput.value));
  if (localNetwork !== "granted") {
    pairButton.disabled = false;
    pairButton.textContent = "Sicher verbinden";
    showError(
      localNetwork === "denied"
        ? "Chrome hat den lokalen Netzwerkzugriff abgelehnt. Erlaube ihn in den Website-Einstellungen und versuche es erneut."
        : "Die lokale Stream-Deck-Bridge ist nicht erreichbar. Läuft die Stream-Deck-App und ist Pairing geöffnet?"
    );
    return;
  }
  const response = await request({ code, kind: "bridge.pair" });
  pairButton.disabled = false;
  pairButton.textContent = "Sicher verbinden";
  if (response === undefined) {
    showError("Die lokale Bridge konnte nicht angesprochen werden.");
    return;
  }

  renderStatus(response.status);
  if (!response.ok) {
    showError(response.error);
  } else {
    pairInput.value = "";
  }
}

async function savePort(): Promise<void> {
  clearError();
  const port = Number(portInput.value);
  const response = await request({ kind: "bridge.port.set", port });
  if (response === undefined) {
    showError("Der Port konnte nicht gespeichert werden.");
    return;
  }
  renderStatus(response.status);
  if (!response.ok) {
    showError(response.error);
  }
}

async function forgetPairing(): Promise<void> {
  clearError();
  const response = await request({ kind: "bridge.pair.forget" });
  if (response === undefined) {
    showError("Das Pairing konnte nicht gelöscht werden.");
    return;
  }
  renderStatus(response.status);
}

async function request(message: ExtensionRequest) {
  try {
    const response: unknown = await chrome.runtime.sendMessage(message);
    return isExtensionResponse(response) ? response : undefined;
  } catch {
    return undefined;
  }
}

function renderStatus(status: PublicBridgeStatus): void {
  portInput.value = String(status.port);
  statusDot.className = "status-dot";

  if (status.authentication === "authenticated" && status.connection === "connected") {
    statusDot.classList.add("status-dot--online");
    connectionStatus.textContent = "Sicher mit Stream Deck verbunden";
    pairForm.hidden = true;
  } else if (status.connection === "connecting" || status.authentication === "pairing") {
    statusDot.classList.add("status-dot--busy");
    connectionStatus.textContent = "Lokale Verbindung wird aufgebaut …";
    pairForm.hidden = false;
  } else {
    statusDot.classList.add("status-dot--offline");
    connectionStatus.textContent =
      status.authentication === "unpaired"
        ? "Noch nicht gepaart"
        : "Lokale Bridge nicht erreichbar";
    pairForm.hidden = false;
  }

  meetingStatus.textContent =
    status.meetingMultiplicity === "one"
      ? "Ein laufendes Meeting ist steuerbar."
      : status.meetingMultiplicity === "multiple"
        ? "Mehrere laufende Meetings erkannt – Steuerung ist sicher blockiert."
        : "Kein steuerbares Meeting erkannt.";

  if (status.problem !== undefined) {
    showError(problemText(status.problem));
  }
}

function problemText(problem: NonNullable<PublicBridgeStatus["problem"]>): string {
  switch (problem) {
    case "authentication_failed":
      return "Die gegenseitige Authentifizierung ist fehlgeschlagen. Bitte paare beide Seiten neu.";
    case "bridge_unavailable":
      return "Die lokale Bridge ist nicht erreichbar. Läuft die Stream-Deck-App?";
    case "invalid_pairing_code":
      return "Der Pairing-Code ist ungültig.";
    case "local_network_denied":
      return "Chrome hat die lokale Verbindung blockiert. Erlaube den lokalen Netzwerkzugriff und versuche es erneut.";
    case "pairing_expired":
      return "Der Pairing-Code ist abgelaufen. Erzeuge im Property Inspector einen neuen.";
    case "protocol_error":
      return "Die Bridge hat unerwartete Daten gesendet. Die Verbindung wurde vorsichtshalber beendet.";
  }
}

function showError(message: string): void {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

function clearError(): void {
  errorMessage.textContent = "";
  errorMessage.hidden = true;
}

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing extension UI element: ${id}`);
  }
  return element as T;
}
