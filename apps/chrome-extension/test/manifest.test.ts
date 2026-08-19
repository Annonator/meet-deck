import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")
) as Record<string, unknown>;

describe("Chrome manifest privacy boundary", () => {
  it("keeps required access to storage, reconnect alarms, and the static Meet script", () => {
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("optional_permissions");
    expect(manifest).not.toHaveProperty("oauth2");
    expect(manifest).not.toHaveProperty("externally_connectable");
    expect(manifest).not.toHaveProperty("web_accessible_resources");
    expect(manifest.content_scripts).toEqual([
      {
        matches: ["https://meet.google.com/*"],
        js: ["content-script.js"],
        run_at: "document_idle"
      }
    ]);
  });

  it("declares only optional numeric IPv4 loopback WebSocket access", () => {
    expect(manifest.optional_host_permissions).toEqual(["ws://127.0.0.1/*"]);
    const serialized = JSON.stringify(manifest.optional_host_permissions);
    expect(serialized).not.toMatch(/localhost|\[::1\]|<all_urls>|\*:\/\/\*|192\.168|10\.0/u);
    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self'; object-src 'self'; connect-src 'self' ws://127.0.0.1:*"
    });
  });

  it("uses localized English-default metadata and pins the Chrome security baseline", () => {
    expect(manifest.default_locale).toBe("en");
    expect(manifest.name).toBe("__MSG_app_name__");
    expect(manifest.short_name).toBe("__MSG_app_short_name__");
    expect(manifest.description).toBe("__MSG_app_description__");
    expect(manifest.action).toMatchObject({ default_title: "__MSG_action_title__" });
    expect(manifest.incognito).toBe("not_allowed");
    expect(manifest.minimum_chrome_version).toBe("147");
  });
});
