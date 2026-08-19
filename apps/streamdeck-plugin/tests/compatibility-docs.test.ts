import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

describe("documented Stream Deck host compatibility", () => {
  it("keeps the public macOS requirement aligned with the plugin manifest", async () => {
    const [
      manifestText,
      readme,
      englishSetup,
      germanSetup,
      marketplaceReadme,
      marketplaceListingText,
      chromeListingText
    ] = await Promise.all([
      readRepositoryFile("apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/manifest.json"),
      readRepositoryFile("README.md"),
      readRepositoryFile("docs/en/setup.md"),
      readRepositoryFile("docs/de/setup.md"),
      readRepositoryFile("marketplace/README.md"),
      readRepositoryFile("marketplace/listing.json"),
      readRepositoryFile("apps/chrome-extension/store/listing.json")
    ]);
    const manifest = JSON.parse(manifestText) as {
      OS: Array<{ Platform: string; MinimumVersion: string }>;
    };
    const macOS = manifest.OS.find(({ Platform }) => Platform === "mac");
    const marketplaceListing = JSON.parse(marketplaceListingText) as {
      product: { requirements: { macOSMinimum: string } };
    };

    expect(macOS?.MinimumVersion).toBe("13");
    expect(readme).toContain("requires macOS 13+");
    expect(englishSetup).toContain("macOS 13 or newer");
    expect(germanSetup).toContain("macOS 13 oder neuer");
    expect(marketplaceListing.product.requirements.macOSMinimum).toBe("13");

    for (const document of [
      readme,
      englishSetup,
      germanSetup,
      marketplaceReadme,
      marketplaceListingText,
      chromeListingText
    ]) {
      expect(document).not.toMatch(/macOS 12(?:\+| or newer| oder neuer)/u);
    }
  });

  it("keeps store-facing companion and permission terminology current", async () => {
    const [marketplaceReadme, marketplaceListingText, demoVideo] = await Promise.all([
      readRepositoryFile("marketplace/README.md"),
      readRepositoryFile("marketplace/listing.json"),
      readRepositoryFile("marketplace/demo-video.md")
    ]);
    const marketplaceListing = JSON.parse(marketplaceListingText) as {
      product: { interfaceLanguages: { chromeCompanion: string[] } };
    };
    const storeCopy = [marketplaceReadme, marketplaceListingText, demoVideo].join("\n");

    expect(marketplaceListing.product.interfaceLanguages.chromeCompanion).toEqual(["en", "de"]);
    expect(storeCopy).not.toMatch(/Chrome Local Network Access|Sicher verbinden|German companion/u);
    expect(storeCopy).toContain("Pair and connect");
    expect(storeCopy).toContain("ws://127.0.0.1:<configured port>/*");
  });
});
