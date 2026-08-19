// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { localizeDocument, localizeMessage } from "../src/ui/i18n";

interface MessageEntry {
  readonly description?: string;
  readonly message: string;
}

type MessageCatalog = Record<string, MessageEntry>;

const english = await readCatalog("en");
const german = await readCatalog("de");
const manifest = JSON.parse(
  await readFile(resolve(process.cwd(), "public/manifest.json"), "utf8")
) as Record<string, unknown>;
const popupHtml = await readFile(resolve(process.cwd(), "public/popup.html"), "utf8");
const onboardingHtml = await readFile(resolve(process.cwd(), "public/onboarding.html"), "utf8");

const DYNAMIC_MESSAGE_KEYS = [
  "error_background_unavailable",
  "error_invalid_pairing_code",
  "error_invalid_bridge_port",
  "error_loopback_permission_denied",
  "error_loopback_permission_request_failed",
  "error_bridge_unavailable_pairing",
  "error_bridge_message_failed",
  "error_port_save_failed",
  "error_forget_failed",
  "error_permission_cleanup_failed",
  "connection_connected",
  "connection_connecting",
  "connection_unpaired",
  "connection_bridge_unavailable",
  "meeting_one",
  "meeting_multiple",
  "meeting_none",
  "problem_authentication_failed",
  "problem_bridge_unavailable",
  "problem_invalid_pairing_code",
  "problem_loopback_permission_denied",
  "problem_loopback_permission_required",
  "problem_pairing_expired",
  "problem_protocol_error",
  "error_request_failed",
  "error_secure_storage_unavailable",
  "error_not_paired",
  "onboarding_open_popup_fallback",
  "popup_pair_button_connecting",
  "popup_pair_button_default",
  "popup_connect_button_connecting",
  "popup_connect_button_default"
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chrome extension localization", () => {
  it("keeps complete English and German catalogs in key parity", () => {
    expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());

    for (const [key, entry] of Object.entries(english)) {
      expect(key).toMatch(/^[A-Za-z0-9_@]+$/u);
      expect(entry.message.trim()).not.toBe("");
      expect(entry.description?.trim()).not.toBe("");
      expect(german[key]?.message.trim()).not.toBe("");
    }

    for (const key of DYNAMIC_MESSAGE_KEYS) {
      expect(english[key]?.message).toBeTruthy();
      expect(german[key]?.message).toBeTruthy();
    }
  });

  it("uses English as the manifest default and localizes all user-facing metadata", () => {
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_app_name__");
    expect(manifest.short_name).toBe("__MSG_app_short_name__");
    expect(manifest.description).toBe("__MSG_app_description__");
    expect(manifest.action).toMatchObject({ default_title: "__MSG_action_title__" });
    expect(manifest.optional_host_permissions).toEqual(["ws://127.0.0.1/*"]);

    for (const key of manifestMessageKeys(manifest)) {
      expect(english[key]?.message).toBeTruthy();
      expect(german[key]?.message).toBeTruthy();
    }
  });

  it("keeps usable English markup fallbacks for every localized element", () => {
    for (const html of [popupHtml, onboardingHtml]) {
      const page = new DOMParser().parseFromString(html, "text/html");
      expect(page.documentElement.lang).toBe("en");

      for (const element of page.querySelectorAll<HTMLElement>("[data-i18n]")) {
        const key = element.dataset.i18n;
        expect(key).toBeTruthy();
        if (key === undefined) {
          continue;
        }
        expect(normalizeText(element.textContent)).toBe(normalizeText(english[key]?.message));
        expect(german[key]?.message).toBeTruthy();
      }
    }

    const popup = new DOMParser().parseFromString(popupHtml, "text/html");
    const connectButton = popup.getElementById("connect-button");
    expect(connectButton).toBeInstanceOf(HTMLButtonElement);
    expect(connectButton).toHaveProperty("hidden", true);
    expect(connectButton?.getAttribute("data-i18n")).toBe("popup_connect_button_default");
  });

  it("describes transient inspection separately from data sent to the local plugin", () => {
    expect(english.onboarding_privacy_yes_body?.message).toContain(
      "Visible control labels are inspected transiently"
    );
    expect(english.onboarding_privacy_yes_body?.message).toContain(
      "The local plugin receives only whether zero, one, or multiple meetings are active"
    );
    expect(english.onboarding_privacy_no?.message).toBe("Never sent to the plugin");
    expect(german.onboarding_privacy_yes_body?.message).toContain(
      "Beschriftungen sichtbarer Bedienelemente werden flüchtig geprüft"
    );
    expect(german.onboarding_privacy_no?.message).toBe("Nie an das Plugin gesendet");
  });

  it("renders German strings and updates the document language", () => {
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn((key: string) => german[key]?.message ?? ""),
        getUILanguage: vi.fn(() => "de-DE")
      }
    });
    const page = new DOMParser().parseFromString(popupHtml, "text/html");

    localizeDocument(page);

    expect(page.documentElement.lang).toBe("de");
    expect(page.getElementById("connection-heading")?.textContent).toBe("Verbindung");
    expect(page.getElementById("connect-button")?.textContent).toBe("Verbinden");
  });

  it("preserves explicit English fallbacks when Chrome has no message", () => {
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn(() => ""),
        getUILanguage: vi.fn(() => "")
      }
    });
    const page = new DOMParser().parseFromString(
      '<!doctype html><html lang="en"><body><p data-i18n="missing">English fallback</p></body></html>',
      "text/html"
    );

    localizeDocument(page);

    expect(page.documentElement.lang).toBe("en");
    expect(page.querySelector("p")?.textContent).toBe("English fallback");
    expect(localizeMessage("missing", "English fallback")).toBe("English fallback");
  });

  it("labels unsupported-locale English fallback content as English", () => {
    vi.stubGlobal("chrome", {
      i18n: {
        getMessage: vi.fn(() => ""),
        getUILanguage: vi.fn(() => "fr-FR")
      }
    });
    const page = new DOMParser().parseFromString(popupHtml, "text/html");

    localizeDocument(page);

    expect(page.documentElement.lang).toBe("en");
    expect(page.getElementById("connection-heading")?.textContent).toBe("Connection");
  });
});

async function readCatalog(locale: "de" | "en"): Promise<MessageCatalog> {
  return JSON.parse(
    await readFile(resolve(process.cwd(), `public/_locales/${locale}/messages.json`), "utf8")
  ) as MessageCatalog;
}

function manifestMessageKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  visit(value);
  return keys;

  function visit(candidate: unknown): void {
    if (typeof candidate === "string") {
      for (const match of candidate.matchAll(/__MSG_([A-Za-z0-9_@]+)__/gu)) {
        if (match[1] !== undefined) {
          keys.add(match[1]);
        }
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (typeof candidate === "object" && candidate !== null) {
      Object.values(candidate).forEach(visit);
    }
  }
}

function normalizeText(value: string | undefined | null): string {
  return value?.replace(/\s+/gu, " ").trim() ?? "";
}
