# Veröffentlichung

Meet Deck wird von **annonator** veröffentlicht. Die Plugin-UUID `dev.annonator.meet-deck` bleibt
dauerhaft unverändert; eine Änderung würde ein anderes Plugin erzeugen und bestehende Profile
brechen.

## Release-Modell

- SemVer-Tags haben die Form `vX.Y.Z`.
- Root- und Workspace-Paketmetadaten, Lockfile, Chrome-Manifest und vierteilige Stream-Deck-Version
  bleiben synchron (`X.Y.Z` beziehungsweise `X.Y.Z.0`).
- GitHub ist die kanonische Quelle für Source und Build-Provenienz.
- GitHub Actions baut Artefakte, enthält aber keine Zugangsdaten für Chrome Web Store oder Elgato
  Marketplace. Store-Einreichungen erfolgen manuell.

## Checkliste vor dem Release

1. Sauberen, vorgesehenen Release-Commit verwenden.
2. Namen, Icons, Texte und Datenschutzhinweise auf `annonator` und `dev.annonator.meet-deck` prüfen.
3. Extension-Rechte auf `storage` und `alarms`, Meet-only Content Script und Loopback-WebSocket-CSP
   prüfen. Im Chrome-Listing erklären, dass `alarms` nur einen lokalen Bridge-Reconnect-Wecktermin
   ohne Meetingdaten plant; jede Berechtigung erläutern.
4. Mit Node 24 `npm ci`, `npm run release:verify -- vX.Y.Z`, `npm run check` und `npm run pack`
   ausführen.
5. [Hardware-E2E](hardware-e2e.md) auf minimaler und aktueller unterstützter Version durchführen,
   einschließlich LNA-Ablehnung und Picker-Abbruch.
6. Gebaute Extension prüfen: keine unerwarteten Hosts, Remote-Code, Entwicklungs-URLs oder Source
   Maps mit Secrets.
7. Plugin mit `npm run validate` prüfen und gepacktes Artefakt in einem sauberen Stream-Deck-Profil
   installieren.
8. Release Notes mit Änderungen, Kompatibilität, Security/Privacy-Auswirkung und bekannten
   Meet-UI-Grenzen verfassen.

Den Release-Commit nach `main` pushen und den erfolgreichen CI-Lauf abwarten. Danach auf diesem
Commit ein annotiertes (und, sofern verfügbar, signiertes) `vX.Y.Z`-Tag erstellen und pushen. Der
Release-Workflow lehnt Tags ab, deren Commit nicht in `main` enthalten ist, leitet `X.Y.Z` aus dem
Tag ab und schlägt bei jeder Abweichung in Paket-, Lockfile-, Manifest- oder internen
Abhängigkeitsversionen fehl.

Pull Requests und jeder gepushte Commit auf `main` durchlaufen Formatierung, Lint, Typprüfung,
Tests, Build, Validierung und Paketierung vollständig. Veraltete Pull-Request-Läufe werden ersetzt;
Post-Merge-Läufe auf `main` werden durch spätere Merges nicht abgebrochen. Release-Builds haben nur
Lesezugriff auf das Repository. Erst der separate Publish-Job darf nach erfolgreichen Gates und
Artefaktprüfungen das GitHub Release erstellen.

## GitHub-Artefakte

- `dev.annonator.meet-deck.streamDeckPlugin`
- `meet-deck-chrome-vX.Y.Z.zip` mit `manifest.json` im ZIP-Wurzelverzeichnis
- `SHA256SUMS.txt`

Checksummen erst nach finalem Packaging erzeugen und vor Upload einmal prüfen. Nie `node_modules`,
Fixtures, lokale Einstellungen, Pairingmaterial, `.env` oder Store-Zugangsdaten aufnehmen.

## Chrome Web Store

1. Publisher `annonator` mit starker MFA absichern.
2. Exakt das ZIP des GitHub-Releases hochladen, nicht lokal neu bauen.
3. Englische Store-Texte, Screenshots, Support-/Repository-Link und aktuellen
   [Datenschutzhinweis](privacy.md) bereitstellen.
4. Single Purpose angeben: lokale Stream-Deck-Steuerung von Google Meet.
5. `storage`, das reine Reconnect-`alarms`, `https://meet.google.com/*`, Loopback-WebSocket, LNA und
   Pairing erklären sowie bestätigen, dass keine Daten verkauft, remote verarbeitet oder für
   Werbung/Analytics genutzt werden. Alarme enthalten nur festen Namen/Zeitplan und keine
   Meetingdaten.
6. Review-Schritte für Pairing und Test-Meet liefern. Der Reviewer muss die Freigabequelle weiterhin
   selbst im Chrome-Picker wählen.
7. Nach Freigabe Store-Version in Release Notes dokumentieren und die Kopplung der über den Store
   installierten Extension mit dem Release-Plugin testen.

Keinen Remote-Konfigurationsdienst und keinen remote gehosteten ausführbaren Code ergänzen. Neue
Berechtigungen erfordern vor Einreichung Design-/Security-Review und aktualisierte
Datenschutzhinweise.

## Elgato Marketplace

1. Maker `annonator` und feste UUID verwenden.
2. Exakt das `.streamDeckPlugin` aus dem GitHub-Release hochladen.
3. App-Icon, 1920×960-Thumbnail, Galerie, englische Beschreibung, Release Notes,
   Support-/Repository- und Privacy-Link bereitstellen.
4. Companion-Chrome-Erweiterung, lokalen Betrieb und zwingende manuelle Freigabequellenwahl klar
   nennen.
5. Review-Schritte für Installation, Kopplung und alle vier Aktionen liefern.
6. Nach Freigabe Installation, Update und Listing in einem sauberen Profil prüfen.

Bleibt das Marketplace-Artefakt nicht transparent, steht das gleich versionierte, prüfbare
GitHub-Artefakt mit Checksumme weiter bereit.

## Rollback und Security-Releases

Bestehende Tags/Artefakte nie verschieben oder ersetzen. Fehlerhafte Releases kennzeichnen,
gegebenenfalls aus Stores zurückziehen und als neue Patchversion korrigieren. Ein Protokollbruch
braucht einen expliziten Migrationsplan; v1-Peers müssen bei unbekannter Version geschlossen
scheitern.

## Offizielle Referenzen zur Einreichung

- [Registrierung im Chrome Web Store](https://developer.chrome.com/docs/webstore/register/)
- [Chrome-Erweiterung für den Store vorbereiten](https://developer.chrome.com/docs/webstore/prepare/)
- [Elgato Plugin Distribution](https://docs.elgato.com/streamdeck/sdk/introduction/distribution/)
- [Einreichung im Elgato Marketplace](https://docs.elgato.com/maker-console/submitting-products/)
