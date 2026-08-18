import type { JoinedDocument } from "./tab-registry";

export function validateMeetContentSender(
  sender: chrome.runtime.MessageSender | undefined,
  extensionId: string
): JoinedDocument | undefined {
  const tabId = sender?.tab?.id;
  const windowId = sender?.tab?.windowId;
  const documentId = sender?.documentId;
  if (
    sender?.id !== extensionId ||
    sender.origin !== "https://meet.google.com" ||
    !isExactMeetUrl(sender.url) ||
    sender.documentLifecycle !== "active" ||
    sender.frameId !== 0 ||
    typeof tabId !== "number" ||
    !Number.isInteger(tabId) ||
    typeof windowId !== "number" ||
    !Number.isInteger(windowId) ||
    typeof documentId !== "string" ||
    documentId.length === 0
  ) {
    return undefined;
  }

  return { documentId, tabId, windowId };
}

function isExactMeetUrl(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.origin === "https://meet.google.com" &&
      url.protocol === "https:" &&
      url.hostname === "meet.google.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return false;
  }
}

export function isTrustedExtensionPageSender(
  sender: chrome.runtime.MessageSender,
  extensionId: string
): boolean {
  return sender.id === extensionId && sender.origin === `chrome-extension://${extensionId}`;
}
