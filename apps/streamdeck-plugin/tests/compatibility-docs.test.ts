import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

describe("documented Stream Deck host compatibility", () => {
  it("keeps the public macOS requirement aligned with the plugin manifest", async () => {
    const [manifestText, readme, englishSetup, germanSetup] = await Promise.all([
      readRepositoryFile("apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/manifest.json"),
      readRepositoryFile("README.md"),
      readRepositoryFile("docs/en/setup.md"),
      readRepositoryFile("docs/de/setup.md")
    ]);
    const manifest = JSON.parse(manifestText) as {
      OS: Array<{ Platform: string; MinimumVersion: string }>;
    };
    const macOS = manifest.OS.find(({ Platform }) => Platform === "mac");

    expect(macOS?.MinimumVersion).toBe("13");
    expect(readme).toContain("requires macOS 13+");
    expect(englishSetup).toContain("macOS 13 or newer");
    expect(germanSetup).toContain("macOS 13 oder neuer");

    for (const document of [readme, englishSetup, germanSetup]) {
      expect(document).not.toMatch(/macOS 12(?:\+| or newer| oder neuer)/u);
    }
  });
});
