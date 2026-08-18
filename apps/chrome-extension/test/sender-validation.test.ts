import { describe, expect, it } from "vitest";

import {
  isTrustedExtensionPageSender,
  validateMeetContentSender
} from "../src/bridge/sender-validation";

const EXTENSION_ID = "a".repeat(32);
const VALID_SENDER = {
  documentId: "document-1",
  documentLifecycle: "active",
  frameId: 0,
  id: EXTENSION_ID,
  origin: "https://meet.google.com",
  tab: { id: 17, windowId: 4 },
  url: "https://meet.google.com/abc-defg-hij"
} as chrome.runtime.MessageSender;

describe("content-script sender boundary", () => {
  it("derives tab identity only from an exact top-level Meet sender", () => {
    expect(validateMeetContentSender(VALID_SENDER, EXTENSION_ID)).toEqual({
      documentId: "document-1",
      tabId: 17,
      windowId: 4
    });
  });

  it.each([
    { id: "b".repeat(32) },
    { origin: "https://evil.example" },
    { url: undefined },
    { url: "https://evil.example/abc-defg-hij" },
    { url: "http://meet.google.com/abc-defg-hij" },
    { url: "not a URL" },
    { documentLifecycle: undefined },
    { documentLifecycle: "prerender" },
    { documentLifecycle: "cached" },
    { documentLifecycle: "pending_deletion" },
    { frameId: 1 },
    { documentId: "" },
    { tab: undefined }
  ])("rejects an untrusted or incomplete sender: %o", (override) => {
    expect(
      validateMeetContentSender(
        { ...VALID_SENDER, ...override } as chrome.runtime.MessageSender,
        EXTENSION_ID
      )
    ).toBeUndefined();
  });

  it("accepts extension UI messages only from the exact extension origin", () => {
    expect(
      isTrustedExtensionPageSender(
        { id: EXTENSION_ID, origin: `chrome-extension://${EXTENSION_ID}` },
        EXTENSION_ID
      )
    ).toBe(true);
    expect(
      isTrustedExtensionPageSender(
        { id: EXTENSION_ID, origin: "https://meet.google.com" },
        EXTENSION_ID
      )
    ).toBe(false);
  });
});
