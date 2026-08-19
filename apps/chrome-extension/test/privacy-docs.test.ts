import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const repositoryRoot = new URL("../../../", import.meta.url);
const documentationPaths = [
  "README.md",
  "docs/en/privacy.md",
  "docs/de/privacy.md",
  "docs/en/setup.md",
  "docs/de/setup.md",
  "docs/en/security.md",
  "docs/de/security.md",
  "docs/en/architecture.md",
  "docs/de/architecture.md",
  "docs/en/hardware-e2e.md",
  "docs/de/hardware-e2e.md",
  "docs/en/publishing.md",
  "docs/de/publishing.md"
] as const;

const documents = new Map(
  await Promise.all(
    documentationPaths.map(
      async (path) => [path, await readFile(new URL(path, repositoryRoot), "utf8")] as const
    )
  )
);

function document(path: (typeof documentationPaths)[number]): string {
  const contents = documents.get(path);
  if (contents === undefined) {
    throw new Error(`Missing documentation fixture: ${path}`);
  }
  return contents;
}

describe("public privacy and loopback documentation", () => {
  it("makes the Limited Use commitment and distinguishes Google credentials from local pairing", () => {
    const english = document("docs/en/privacy.md");
    const german = document("docs/de/privacy.md");

    for (const privacy of [english, german]) {
      expect(privacy).toContain(
        "https://developer.chrome.com/docs/webstore/program-policies/limited-use/"
      );
      expect(privacy).toMatch(
        /Chrome Web Store User Data Policy|Nutzerdatenrichtlinie des Chrome Web Store/u
      );
      expect(privacy).toMatch(/Limited Use|Limited-Use/u);
      expect(privacy).toMatch(/256-[Bb]it/u);
      expect(privacy).toContain("chrome.storage.local");
      expect(privacy).toMatch(/authentication\/session|Authentifizierungs-\/Sitzungstoken/u);
      expect(privacy).toMatch(/Meet Deck pairing credential|Meet-Deck-Pairing-Token/u);
    }

    expect(english).toContain("does not access Google account credentials");
    expect(english).toContain("disclosed single purpose");
    expect(english).toContain("does not sell the information");
    expect(english).toMatch(/third\s+party or remote service/u);
    expect(english).toContain("advertising, profiling");
    expect(english).toMatch(/publisher or another\s+human/u);

    expect(german).toContain("greift weder auf Google-Account-Zugangsdaten");
    expect(german).toContain("alleinigen Zweck");
    expect(german).toMatch(/weder\s+verkauft noch an Dritte oder entfernte Dienste übertragen/u);
    expect(german).toContain("Werbung, Profiling");
    expect(german).toContain("Herausgeber oder ein anderer Mensch");
  });

  it("documents the exact privacy-minimised Meet projection", () => {
    const english = document("docs/en/privacy.md");
    const german = document("docs/de/privacy.md");

    for (const privacy of [english, german]) {
      expect(privacy).toContain("Accessibility");
      expect(privacy).toMatch(/sender URL|Sender-URL/u);
      for (const field of [
        "meetingMultiplicity",
        "microphone",
        "camera",
        "hand",
        "selfPresentation",
        "result"
      ]) {
        expect(privacy).toContain(`\`${field}\``);
      }
      expect(privacy).toMatch(/never enter the loopback|gelangen nie in die Loopback/u);
    }

    expect(english).toContain("sender/tab/document IDs");
    expect(english).toContain("Meet URLs and codes");
    expect(english).toContain("participants, communications, and media never enter the loopback");
    expect(german).toContain("Sender-/Tab-/Dokument-IDs");
    expect(german).toContain("Meet-URLs/-Codes");
    expect(german).toMatch(
      /Teilnehmer,\s+Kommunikations- und Mediendaten gelangen nie in die Loopback/u
    );
  });

  it("distinguishes the credential, configured port, and Chrome grant lifecycles", () => {
    const english = document("docs/en/privacy.md");
    const german = document("docs/de/privacy.md");

    expect(english).toContain("Random 256-bit Meet Deck pairing credential");
    expect(english).toContain("Configured loopback port");
    expect(english).toContain("Exact-port Chrome host grant");
    expect(english).toContain("**Forget pairing** retains it");
    expect(english).toContain("removes the plugin's copy of the credential");
    expect(english).toMatch(/Use both\s+controls for a complete two-sided reset/u);

    expect(german).toContain("zufälliges 256-Bit-Meet-Deck-Pairing-Token");
    expect(german).toContain("konfigurierter Loopback-Port");
    expect(german).toContain("exakte Chrome-Hostfreigabe für den Port");
    expect(german).toContain("**Pairing löschen** behält ihn bei");
    expect(german).toContain("löscht die Tokenkopie des Plugins");
    expect(german).toMatch(/Für einen vollständigen Reset beide Bedienelemente verwenden/u);
  });

  it("uses the extension host-permission flow and contains no obsolete website prompt wording", () => {
    for (const [path, contents] of documents) {
      expect(contents, path).toMatch(
        /ws:\/\/127\.0\.0\.1:<(?:configured port|konfigurierter Port)>\/\*/u
      );
      expect(contents, path).not.toMatch(
        /Local Network Access|\bLNA\b|Zugriff auf das lokale Netzwerk|Geräte im lokalen Netzwerk|Website-Einstellungen/iu
      );
      expect(contents, path).not.toContain("Pair/Connect");
      expect(contents, path).not.toContain("Koppeln/Verbinden");
    }
  });

  it("covers granted, denied, revoked, and changed-port permission states without broad access", () => {
    for (const path of [
      "docs/en/privacy.md",
      "docs/en/setup.md",
      "docs/en/security.md",
      "docs/en/architecture.md",
      "docs/en/hardware-e2e.md",
      "docs/en/publishing.md"
    ] as const) {
      const contents = document(path);
      expect(contents, path).toMatch(/already-granted|already granted/iu);
      expect(contents, path).toMatch(/denial|denied|deny/iu);
      expect(contents, path).toMatch(/revocation|revoked|revoke/iu);
      expect(contents, path).toMatch(
        /port(?:\s+|-)change|Changing the\s+port|Change[^.\n]{0,50}port/iu
      );
      expect(contents, path).toMatch(
        /\bno\b[^.\n]{0,80}\bLAN\b|\bneither LAN\b|does not grant access to LAN|never expands[^.\n]{0,80}LAN/u
      );
      expect(contents, path).toMatch(/all-URL|all URLs/iu);
    }

    for (const path of [
      "docs/de/privacy.md",
      "docs/de/setup.md",
      "docs/de/security.md",
      "docs/de/architecture.md",
      "docs/de/hardware-e2e.md",
      "docs/de/publishing.md"
    ] as const) {
      const contents = document(path);
      expect(contents, path).toMatch(/bereits\s+(?:erteilt|freigegeben|genehmigt)/u);
      expect(contents, path).toMatch(/Ablehnung|abgelehnt|ablehnen/u);
      expect(contents, path).toMatch(/Widerruf|widerrufen/u);
      expect(contents, path).toMatch(/Portwechsel|Port[^.\n]{0,50}(?:änder|Change)/u);
      expect(contents, path).toMatch(
        /keine LAN|weder[\s\S]{0,100}LAN|ohne[\s\S]{0,80}LAN|nie auf LAN/u
      );
      expect(contents, path).toMatch(/All-URL|alle URLs/u);
    }
  });

  it("requires matching English-default and German-localized store listings", () => {
    expect(document("docs/en/publishing.md")).toContain("English default listing");
    expect(document("docs/en/publishing.md")).toContain("German localized listing");
    expect(document("docs/de/publishing.md")).toContain("englisches Standard-Listing");
    expect(document("docs/de/publishing.md")).toContain("deutsch lokalisiertes Listing");
  });
});
