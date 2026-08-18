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
    statusElement.textContent =
      "Pinne Meet Deck über das Erweiterungen-Menü und klicke anschließend auf das Symbol in der Toolbar.";
  }
}
