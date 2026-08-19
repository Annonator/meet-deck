export function localizeMessage(key: string, englishFallback: string): string {
  const localized = chrome.i18n.getMessage(key);
  return localized.length > 0 ? localized : englishFallback;
}

export function localizeDocument(documentRoot: Document = document): void {
  const language = chrome.i18n.getUILanguage();
  documentRoot.documentElement.lang = /^de(?:-|$)/iu.test(language) ? "de" : "en";

  for (const element of documentRoot.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = element.dataset.i18n;
    if (key === undefined || key.length === 0) {
      continue;
    }

    const localized = chrome.i18n.getMessage(key);
    if (localized.length > 0) {
      element.textContent = localized;
    }
  }
}
