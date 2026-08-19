import { localizeDocument, localizeMessage } from "./ui/i18n";

localizeDocument();

const openButton = document.getElementById("open-popup");
const status = document.getElementById("onboarding-status");

if (openButton instanceof HTMLButtonElement && status !== null) {
  openButton.addEventListener("click", () => {
    void openPopup(status);
  });
}

async function openPopup(statusElement: HTMLElement): Promise<void> {
  try {
    await chrome.action.openPopup();
    statusElement.textContent = "";
  } catch {
    statusElement.textContent = localizeMessage(
      "onboarding_open_popup_fallback",
      "Pin Meet Deck from Chrome's Extensions menu, then select its icon in the toolbar."
    );
  }
}
