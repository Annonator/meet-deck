# Datenschutzhinweise

**Herausgeber:** annonator  
**Produkt:** Meet Deck (`dev.annonator.meet-deck`)  
**Gültig für:** Stream-Deck-Plugin und Chrome-Erweiterung

## Kurzfassung

Meet Deck steuert wenige Google-Meet-Schaltflächen ausschließlich durch Software auf demselben Mac.
Es gibt keinen Server, Account, Cloud-Sync, Telemetrie, Analytics, Werbung oder Remote-Logging.
Meetinginhalte verlassen den Browser nicht und werden nicht an das Stream-Deck-Plugin übertragen.

## Verarbeitete Daten

| Daten                                                       | Zweck                                        | Ziel                                           | Speicherdauer                                |
| ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Endliche Mikrofon-/Kamera-/Hand-/Eigenpräsentationszustände | Tasten anzeigen und Befehle bestätigen       | gekoppeltes Plugin auf `127.0.0.1`             | nur Arbeitsspeicher                          |
| Meeting-Vielfachheit (`none`, `one`, `multiple`)            | falsches Ziel verhindern                     | gekoppeltes Plugin auf `127.0.0.1`             | nur Arbeitsspeicher                          |
| Zufällige Sitzungs-/Befehls-IDs                             | lokale Reihenfolge und Zuordnung             | Browser und Plugin                             | nur Arbeitsspeicher                          |
| Achtstelliger Pairingcode                                   | bewusstes erstmaliges Koppeln                | Loopback-Verbindung                            | höchstens zwei Minuten                       |
| Zufälliges 256-Bit-Token                                    | spätere lokale Verbindungen authentifizieren | Chrome-Storage und lokale Plugin-Einstellungen | bis Entkopplung, Löschen oder Deinstallation |
| Loopback-Port                                               | lokales Plugin finden                        | nur lokale Einstellungen                       | bis Änderung oder Deinstallation             |

Undurchsichtige Transport-Sitzungs- und Befehls-IDs werden zufällig erzeugt und nicht aus URL, Code,
Titel, Teilnehmer oder Account abgeleitet.

## Bewusst nicht erhoben

Meet Deck erhebt, überträgt, speichert und protokolliert keine:

- Meeting-URLs/-Codes, Titel, Kalendereinträge oder Account-Identität;
- Teilnehmernamen, Profilbilder, Anwesenheit, Reaktionen oder Präsenzdaten;
- Chats, Untertitel, Transkripte, Aufzeichnungen oder Dateien;
- Audio-, Video-, Screenshot-, Freigabebild- oder Quellennamen;
- Browserverlauf, Cookies, Google-Anmeldedaten oder Authentifizierungstoken;
- Analytics, Crash-Telemetrie, Nutzungsmetriken oder Werbe-IDs.

## Browserzugriff

Das Content Script ist auf `https://meet.google.com/*` beschränkt. Mit `storage` hält die
Erweiterung Pairingtoken und lokale Konfiguration. `alarms` plant nach einer Pause des MV3-Workers
einen lokalen Reconnect-/Wecktermin mit festem Namen; Chrome-Alarme enthalten nur Name und Zeitplan,
keine Meeting-, Steuer- oder Authentifizierungsdaten und keine beliebigen Payloads. Der
Alarm-Callback versucht ausschließlich erneut die Loopback-Verbindung.

Meet Deck fordert weder breiten Webseitenzugriff noch `tabs`, Cookies, Netzwerkinspektion,
Debugging, Desktop Capture, Mikrofon- oder Kamerarechte an.

Inkognito-Nutzung ist deaktiviert. Das gekoppelte Token bleibt im bewusst gewählten regulären
Chrome-Profil.

Chrome kann Local Network Access für den WebSocket zu `127.0.0.1` abfragen. Meet Deck nutzt die
Berechtigung nicht zum Scannen des LAN und besitzt keinen Remote-Fallback.

## Bildschirmfreigabe

Meet Deck darf die Meet-Oberfläche „Jetzt präsentieren“ öffnen, aber keine Quelle auswählen oder
erfassen. Chrome und macOS verlangen im eigenen Picker die bewusste Auswahl eines Bildschirms,
Fensters oder Tabs. Picker-Inhalte und übertragene Pixel werden von Meet Deck weder empfangen noch
gespeichert.

## Kontrolle und Löschung

**Entkoppeln** macht die lokale Beziehung ungültig. Entfernen über `chrome://extensions` löscht den
von Chrome verwalteten Extension-Speicher; das Plugin wird über die Stream-Deck-App entfernt.
Backups von Chrome/macOS unterliegen diesen Produkten.

Mangels Meet-Deck-Server existieren kein entferntes Nutzerkonto und keine serverseitigen Daten zum
Exportieren oder Löschen.

## Änderungen und Fragen

Wesentliche Datenschutzänderungen erfordern ein dokumentiertes Release und aktualisierte
Store-Angaben. Datenschutzprobleme gemäß Security-Hinweisen des Repositories melden und dabei
niemals echte Meetinglinks/-codes, Namen, Chats, Untertitel oder Medien mitsenden.
