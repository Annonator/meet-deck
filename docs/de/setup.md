# Einrichtung

## Voraussetzungen

- macOS 13 oder neuer
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

Der Zugriff auf das lokale Plugin ist eine getrennte optionale Chrome-Extension-Hostberechtigung.
Erst bei **Koppeln und verbinden** oder **Verbinden** fragt das Popup den exakten konfigurierten
Ursprung `ws://127.0.0.1:<konfigurierter Port>` über das Chrome-Match-Pattern
`ws://127.0.0.1:<konfigurierter Port>/*` an. Für eine bereits erteilte passende Freigabe beendet
Chrome den Aufruf ohne neue Abfrage. Die Berechtigung umfasst weder LAN-Hosts, `localhost`, andere
Loopback-Adressen noch alle URLs; Schema, Host und Port enthalten keine Wildcards.

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
4. Das Meet-Deck-Popup in Chrome öffnen, Code eingeben und **Koppeln und verbinden** wählen. Für ein
   gespeichertes Pairing **Verbinden** wählen. Beide eindeutigen Nutzeraktionen erlauben nur die
   Anfrage für die angezeigte konfigurierte Loopback-Origin.
5. Falls Chrome fragt, das exakte Host-Match-Pattern `ws://127.0.0.1:<konfigurierter Port>/*`
   erlauben. Eine Ablehnung lässt Meet Deck ohne Remote-Fallback offline; bei bereits erteilter
   passender Freigabe erscheint keine erneute Abfrage.
6. In beiden Oberflächen den Status **Verbunden** prüfen.

Eine neue Kopplung ersetzt das vorherige Chrome-Profil. Neuinstallation oder das Löschen des
Extension-Speichers erfordert erneutes Koppeln. Einen Pairingcode nicht weitergeben; während seiner
kurzen Gültigkeit erlaubt er lokale Steuerung.

Ein späterer Widerruf der Loopback-Hostfreigabe beendet neue Verbindungen und Reconnects. **Koppeln
und verbinden** oder **Verbinden** kann sie erneut anfragen. Ein Portwechsel ändert die Origin und
erfordert daher Hostzugriff für exakt den neuen Port; eine Freigabe für einen Port gilt nie als
Freigabe für einen anderen. Das Speichern eines geänderten Ports trennt ein gespeichertes Pairing,
fragt aber selbst keinen Hostzugriff an. Nach erfolgreicher Änderung entfernt Meet Deck die
überholte exakte Portfreigabe und meldet einen Bereinigungsfehler, damit sie manuell widerrufen
werden kann. Nach dem Portwechsel über **Verbinden** die neue Origin freigeben und das gespeicherte
Pairing fortsetzen.

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

- **Offline:** Stream-Deck-App starten, gleichen Port prüfen und Portkonflikt ausschließen.
  **Koppeln und verbinden** oder **Verbinden** wählen und das exakte Host-Match-Pattern
  `ws://127.0.0.1:<konfigurierter Port>/*` erlauben, falls es abgelehnt oder widerrufen wurde.
  Lieber neu koppeln als gespeicherte Token kopieren.
- **Kein Meeting:** dem Meeting vollständig beitreten; die Vorschau zählt nicht.
- **Mehrdeutig:** alle bis auf ein beigetretenes Meet-Tab verlassen.
- **Nicht unterstützte UI:** Meet neu laden und deutsche/englische Sprache prüfen. Beim Melden keine
  Meetingnamen, Codes oder Teilnehmer mitsenden.
- **Freigabe startet nicht:** Meet fokussieren, angezeigten Meet-Kurzbefehl nutzen und Picker
  bestätigen. Diese Bestätigung ist eine Sicherheitsfunktion.
- **Veralteter Zustand nach Update:** Extension neu laden, Stream-Deck-App neu starten und gleiche
  Release-Versionen sicherstellen.
