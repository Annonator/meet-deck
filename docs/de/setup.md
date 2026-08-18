# Einrichtung

## Voraussetzungen

- macOS 12 oder neuer
- Elgato Stream Deck Desktop-App 7.1 oder neuer
- Google Chrome 147 oder neuer
- ein Stream Deck mit LCD-Tasten (die Tasten des Stream Deck + werden unterstützt)
- für Source-Builds: Node.js ab 24.13.1 innerhalb Hauptversion 24 und npm 11

Plugin und Erweiterung müssen aus demselben Release stammen. Beide verwenden Protokollversion 1;
vermischte Entwicklungsstände können inkompatibel sein.

## Browserberechtigungen

Die Erweiterung fordert `storage` für lokales Pairingtoken/Konfiguration und `alarms` für einen
dauerhaften MV3-Reconnect-Wecktermin an. Der feste Reconnect-Alarm enthält nur Name und Zeitplan; er
speichert und transportiert keine Meeting-, Steuer- oder Authentifizierungsdaten. Webseitenzugriff
bleibt auf das Meet-Content-Script unter `https://meet.google.com/*` begrenzt, ohne `tabs`, Cookies,
Mikrofon-, Kamera- oder Desktop-Capture-Berechtigung.

## Release installieren

1. `dev.annonator.meet-deck.streamDeckPlugin`, das passende `meet-deck-chrome-vX.Y.Z.zip` und
   `SHA256SUMS.txt` aus dem GitHub-Release laden.
2. Beide Artefakte gegen `SHA256SUMS.txt` prüfen.
3. Die `.streamDeckPlugin`-Datei doppelklicken und die Installation in der Stream-Deck-App
   bestätigen.
4. Solange die Erweiterung nicht im Chrome Web Store verfügbar ist: ZIP entpacken,
   `chrome://extensions` öffnen, **Entwicklermodus** aktivieren, **Entpackte Erweiterung laden**
   wählen und den entpackten Ordner mit `manifest.json` auswählen.
5. Mikrofon, Kamera, Hand und Präsentation in der Stream-Deck-App auf LCD-Tasten ziehen.

Entwicklermodus-Erweiterungen aktualisieren sich nicht automatisch. Für jedes Release den Ordner
ersetzen und unter `chrome://extensions` **Neu laden** wählen.

## Lokale Bridge koppeln

1. In der Stream-Deck-App eine Meet-Deck-Aktion auswählen, um den Property Inspector zu öffnen.
2. `127.0.0.1:53421` beibehalten, sofern der Port nicht belegt ist. Bei einer Änderung muss im
   Extension-Popup derselbe Port stehen.
3. **Kopplung starten** wählen. Der achtstellige Code ist zwei Minuten gültig.
4. Das Meet-Deck-Popup in Chrome öffnen, Code eingeben und **Koppeln** wählen.
5. Falls Chrome **Zugriff auf das lokale Netzwerk** (LNA) abfragt, zustimmen. Der Zugriff gilt nur
   dem WebSocket zu `127.0.0.1`; eine Ablehnung lässt Meet Deck offline.
6. In beiden Oberflächen den Status **Verbunden** prüfen.

Eine neue Kopplung ersetzt das vorherige Chrome-Profil. Neuinstallation oder das Löschen des
Extension-Speichers erfordert erneutes Koppeln. Einen Pairingcode nicht weitergeben; während seiner
kurzen Gültigkeit erlaubt er lokale Steuerung.

## Bedienung

Genau einem Meeting auf `https://meet.google.com/` beitreten. Lobby und Pre-Join-Vorschau zählen
nicht. Die Icons zeigen bestätigte Meet-Zustände und folgen Änderungen über Meet,
Meet-Tastaturkürzel und Stream Deck.

- **Mikrofon**, **Kamera** und **Hand** setzen den Gegenwert zum bestätigten Zustand.
- **Präsentation** öffnet den Freigabefluss. Im Chrome-/macOS-Picker selbst eine Quelle wählen und
  bestätigen. Meet Deck kann und darf dies nicht umgehen.
- Erneutes Drücken beendet die eigene Präsentation.
- Blockiert Chrome den Start, fokussiert Meet Deck das Meeting und verlangt eine Nutzeraktion. Dann
  den angezeigten offiziellen Meet-Kurzbefehl verwenden und den Picker abschließen.

Ohne beigetretenes Meeting, bei mehreren Meetings oder unbekanntem Layout klickt Meet Deck sicher
nichts.

## Aus dem Quellcode bauen

```sh
npm ci
npm run check
npm run pack
```

Die entpackte Erweiterung liegt unter `apps/chrome-extension/dist`, ihr deterministisches ZIP unter
`artifacts/meet-deck-chrome-vX.Y.Z.zip`. Das Plugin-Bundle liegt unter
`apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin`, sein gepacktes Artefakt unter
`artifacts/dev.annonator.meet-deck.streamDeckPlugin`. CI legt beide Dateien und
`artifacts/SHA256SUMS.txt` gemeinsam im Root-Verzeichnis `artifacts/` ab.

Entwicklungsbefehle:

```sh
npm run dev --workspace @meet-deck/chrome-extension
npx streamdeck link apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin
npm run watch --workspace @meet-deck/streamdeck-plugin
```

Vor Installation eines gepackten Releases das Entwicklungs-Bundle wieder entkoppeln.

## Fehlersuche

- **Offline:** Stream-Deck-App starten, gleichen Port prüfen, LNA erlauben und Portkonflikt
  ausschließen. Lieber neu koppeln als gespeicherte Token kopieren.
- **Kein Meeting:** dem Meeting vollständig beitreten; die Vorschau zählt nicht.
- **Mehrdeutig:** alle bis auf ein beigetretenes Meet-Tab verlassen.
- **Nicht unterstützte UI:** Meet neu laden und deutsche/englische Sprache prüfen. Beim Melden keine
  Meetingnamen, Codes oder Teilnehmer mitsenden.
- **Freigabe startet nicht:** Meet fokussieren, angezeigten Meet-Kurzbefehl nutzen und Picker
  bestätigen. Diese Bestätigung ist eine Sicherheitsfunktion.
- **Veralteter Zustand nach Update:** Extension neu laden, Stream-Deck-App neu starten und gleiche
  Release-Versionen sicherstellen.
