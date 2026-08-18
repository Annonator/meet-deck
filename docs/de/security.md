# Sicherheit und Vertrauensgrenzen

## Sicherheitsziele

Meet Deck macht wenige Meeting-Steueraktionen prüfbar, ohne Meetinginformationen an Dritte zu geben:

- Steuerverkehr bleibt auf dem lokalen Rechner;
- nur eine bewusst gekoppelte Chrome-Erweiterung kommuniziert mit der Bridge;
- Aktionen gelten nur einem eindeutig erkannten, beigetretenen Google Meet;
- jede Wire-Nachricht wird begrenzt und streng validiert;
- Freigabe-Zustimmung verbleibt bei Chrome/macOS und dem Nutzer;
- Fehler sind sichtbar und führen zu keinem geratenen Klick.

## Vertrauensgrenzen

1. **Stream Deck und Desktop-App:** Elgato verwaltet Geräteeingaben und Plugin-Lebenszyklus.
   Einstellungen werden trotzdem validiert.
2. **Plugin-Prozess:** speichert das Secret und lauscht nur auf `127.0.0.1`. Andere lokale Prozesse
   gelten als potenziell feindlich.
3. **Loopback-Transport:** begrenzt die Reichweite, ersetzt aber keine Authentifizierung. Webseiten
   oder lokale Malware können Verbindungen, Replay oder Ressourcenangriffe versuchen.
4. **Chrome-Service-Worker:** speichert das Token, authentifiziert die Bridge und leitet nur
   Protokollnachrichten weiter. MV3-Pausen/Neustarts sind normal. Ein Chrome-Alarm mit festem Namen
   darf ihn für einen erneuten lokalen Bridge-Versuch wecken; dieser Alarm enthält nur
   Zeitplanmetadaten, keine Meeting-, Steuer- oder Authentifizierungs-Payload.
5. **Meet-Content-Script und DOM:** Meet ist veränderlicher Remote-Input. Labels, Attribute,
   Nachrichten und Elementanzahl gelten bis zur engen Validierung als nicht vertrauenswürdig.
6. **Chrome-/OS-Freigabepicker:** liegt außerhalb der Kontrolle von Meet Deck und entscheidet über
   Quellenauswahl und Capture-Zustimmung.

Eine Kompromittierung des lokalen Nutzerkontos, Chrome-Profils, der Stream-Deck-App oder des
Betriebssystems liegt außerhalb der Schutzgrenze.

## Bedrohungen und Kontrollen

| Bedrohung                          | Erforderliche Kontrolle                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Remote-/LAN-Zugriff                | ausschließlich IPv4 `127.0.0.1`, unerwarteten Upgrade-`Host` ablehnen; nie `localhost`, Wildcard, IPv6, LAN oder Cloud-Relay    |
| Beliebige Webseite verbindet sich  | Pairing standardmäßig zu; exakte gekoppelte `chrome-extension://`-Origin binden; vor Befehlen authentifizieren                  |
| Pairingcode wird geraten           | acht Stellen, zwei Minuten, maximal fünf Fehlversuche, bewusst neu öffnen                                                       |
| Nachweis wird gestohlen/wiederholt | zufälliges 256-Bit-Token, frische Client-/Server-Nonces, an Sitzung/Origin/Rollen gebundene gegenseitige HMAC-SHA-256-Nachweise |
| Ungültiger/zu großer Frame         | UTF-8-/JSON-/Schema-Prüfung, exakte Felder, `v: 1`, maximal 16 KiB                                                              |
| Replay/Zuordnungsfehler            | MAC auf jedem geschützten Frame, Sitzungs-/Richtungsbindung, strikt steigende Sequenz je Richtung, unbekannte Aktionen ablehnen |
| Falsches Meeting                   | `meetingMultiplicity: one` verlangen; bei `none`/`multiple` blockieren; URL/Titel nie zum Routing nutzen                        |
| Meet-DOM ändert sich               | exakte Rollen/Accessibility-Zustände, nur ein Treffer und direkt vor Klick neu prüfen, sonst `unsupported_ui`                   |
| Secret/Meetingmetadaten in Logs    | Code/Token/HMAC/MAC, Payload-Dumps, Accessibility-Labels und Meet-Freitext nie loggen; nur endliche Fehlercodes                 |
| Freigabe ohne Quellenwahl          | zwingenden Chrome-/macOS-Picker nutzen; keine `desktopCapture`-Berechtigung                                                     |
| MV3-Reconnect umgeht Auth          | jeden neuen WebSocket vor Zuständen/Befehlen authentifizieren                                                                   |

Neue Kopplung ersetzt das alte Chrome-Profil. Authentifizierung bindet beide 256-Bit-Nonces, die
zufällige Sitzung, die exakte Chrome-Extension-Origin und die Rollen Extension/Plugin. Der
Servernachweis authentifiziert auch das Plugin gegenüber der Extension. Secrets entstehen aus
kryptografisch sicheren Zufallswerten, werden nie aus URL-Parametern akzeptiert und nach Möglichkeit
konstantzeitlich verglichen.

Das Plugin speichert das Token nur in Stream-Deck-**Global Settings**, niemals in exportierbaren
Action Settings. Der Property Inspector tauscht ausschließlich typisierte Steuernachrichten mit dem
Plugin und liest kein Token. Chrome speichert es nur in `chrome.storage.local`, sofort auf
`TRUSTED_CONTEXTS` beschränkt; es wird nicht synchronisiert und ist für das Content Script
unzugänglich.

Das Content Script gilt als nicht vertrauenswürdige Grenze, nicht als Autorität. Der Service Worker
prüft `sender.id`, Hauptframe, exakte Meet-Origin sowie vom Browser gelieferte
Tab-/Dokumentidentität und übernimmt diese nie aus dem Payload. Meldungen enthalten nur geschlossene
Command-/State-Unions, nie Selektoren, JavaScript, URLs, Freitext oder Accessibility-Labels.

## Protokoll-Invarianten

Nur `@meet-deck/protocol` parst Wire-Daten und erzeugt kanonische Eingaben für Authentifizierung und
Frame-MAC. Unbekannte Felder werden abgelehnt. Vor der Authentifizierung sind nur
Pairing-/Auth-Frames top-level erlaubt; danach nur `protected` mit einer Anwendungsmeldung aus
Befehl, Zustand, Ergebnis oder Ping/Pong.

Jeder geschützte Frame bindet Sitzung, Richtung, ab eins startende Sequenz, exakte Meldung und MAC.
Die Sequenz steigt strikt je Sitzung/Richtung. Befehle laufen Plugin→Extension, Zustände/Ergebnisse
Extension→Plugin. Zustände enthalten nur Meeting-Vielfachheit sowie endliche Mikrofon-, Kamera-,
Hand- und Eigenpräsentationswerte, nie Meeting-Freitext.

Vor gegenseitig erfolgreicher Authentifizierung wird kein Zustand/Befehl verarbeitet. Verbindungen
haben Rate Limits und begrenzte Queues; ein Disconnect verwirft unauthentifizierten und flüchtigen
In-Flight-Zustand.

Der Socket akzeptiert nur UTF-8-Text, deaktiviert WebSocket-Kompression, begrenzt vor dem Parsen auf
16 KiB, setzt ein Auth-Timeout und begrenzt unauthentifizierte/authentifizierte Verbindungen.
Befehle sind idempotente `.set`-Operationen mit höchstens einer laufenden Aktion je Control.
Unmittelbar vor dem Klick wird erneut geprüft, dass das einzige passende Element sichtbar,
verbunden, aktiv und semantisch exakt ist; Erfolg verlangt den beobachteten Zielzustand.

## Chrome Local Network Access

[Chrome 147 Local Network Access](https://developer.chrome.com/release-notes/147) kann
Loopback-Verbindungen durch eine ausdrückliche Berechtigung schützen. Meet Deck erklärt sie und
bleibt bei Ablehnung offline. Eine Ablehnung darf nicht mit Proxy, DNS-Rebinding, Native Messaging
oder breiteren Hostrechten umgangen werden. Pairing beginnt per bewusstem Klick im Extension-Popup,
damit Chrome LNA anzeigen kann. Ablehnung, Widerruf und Enterprise-Policy-Blockade sind stabile
Offline-Zustände statt Retry-Schleifen.

## Verpflichtende Security-Tests

- LAN, Wildcard/IPv6, unerwarteter Host, DNS-Rebinding-Host, fehlende/null/doppelte Origin,
  Webseiten und fremde Extensions können die Bridge nicht nutzen;
- Ablauf, fünf Fehlversuche, Race zweier korrekter Pairingclients, Einmaligkeit und Invalidierung
  der alten Token/Sitzung beim Re-Pairing;
- falscher Schlüssel oder veränderte Origin/Nonce/Rolle, manipulierte MACs, doppelte/alte Sequenz,
  alte Sitzung, Binary/ungültiges UTF-8, Zusatzfelder und 16 KiB + 1 werden verworfen;
- Subframes, alte Dokumentidentitäten, falsche Senderdaten und Tokenzugriff des Content Scripts
  scheitern;
- versteckte, deaktivierte, doppelte, ähnliche und zwischen Suche/Klick veränderte Controls erzeugen
  null Klicks;
- LNA erlauben/ablehnen/widerrufen/Enterprise-Block sowie MV3-/Plugin-Neustart testen;
- prüfen, dass der Reconnect-Alarm nur festen Namen/Zeitplan enthält, ausschließlich für einen
  Loopback-Versuch weckt und danach bei fehlendem Bedarf gelöscht wird;
- Traffic, Chrome Storage, Stream-Deck-Global-/Action-Settings, exportiertes Profil und Logs
  enthalten keine verbotenen Meetingmetadaten, Accessibility-Labels, Pairingcodes oder Token.

## Sicherheitslücken melden

Wenn vorhanden, den privaten Security-Kanal des Repositories verwenden. Version, macOS-, Chrome- und
Stream-Deck-Version, reproduzierbare Schritte und Auswirkung angeben. Meetingcodes, URLs, Accounts,
Teilnehmer, Chat, Untertitel und Medien schwärzen. Niemals gegen fremde Meetings testen oder aktive
Pairingtokens veröffentlichen. Ein Fix erhält einen Regressionstest und wird erst nach einem
gepatchten Release offengelegt.
