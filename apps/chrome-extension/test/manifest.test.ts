import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(
  await readFile(new URL("../public/manifest.json", import.meta.url), "utf8")
) as Record<string, unknown>;

describe("Chrome manifest privacy boundary", () => {
  it("requests only local storage, durable reconnect alarms, and the static Meet script", () => {
    expect(manifest.permissions).toEqual(["storage", "alarms"]);
    expect(manifest).not.toHaveProperty("host_permissions");
    expect(manifest).not.toHaveProperty("optional_permissions");
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

  it("disallows incognito and pins the supported Chrome security baseline", () => {
    expect(manifest.incognito).toBe("not_allowed");
    expect(manifest.minimum_chrome_version).toBe("147");
  });
});
