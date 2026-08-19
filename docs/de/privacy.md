# Datenschutzhinweise

**Herausgeber:** annonator  
**Produkt:** Meet Deck (`dev.annonator.meet-deck`)  
**Gültig für:** Stream-Deck-Plugin und Chrome-Erweiterung

[English version](../en/privacy.md)

## Kurzfassung

Meet Deck steuert wenige Google-Meet-Schaltflächen ausschließlich durch Software auf demselben Mac.
Es gibt keinen Server, Account, Cloud-Sync, Telemetrie, Analytics, Werbung oder Remote-Logging. Die
Erweiterung untersucht nur die dafür erforderlichen sichtbaren Steuersignale. Von den in Google Meet
beobachteten Informationen gelangen ausschließlich der minimal erforderliche abgeleitete Meeting-/
Steuerzustand und begrenzte Befehlsergebnisse zum gekoppelten lokalen Stream-Deck-Plugin.

## Verarbeitete Daten

| Daten                                                                                   | Zweck                                                              | Ziel                                           | Speicherdauer                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Accessibility-Labels sichtbarer Meet-Schaltflächen und Steuerattribute                  | unterstützte Controls und Meetingbeitritt erkennen                 | nur Chrome-Erweiterung                         | flüchtig; keine Kopie in Settings, Logs oder lokales Wire-Protokoll                                            |
| von Chrome gelieferte Sender-URL/-Origin und undurchsichtige Tab-/Fenster-/Dokument-IDs | aktiven Top-Level-Meet-Sender prüfen und genau ein Dokument wählen | nur Chrome-Erweiterung                         | Verbindungsspeicher; URL/Pfad werden nicht in Produktzustand kopiert                                           |
| `meetingMultiplicity` sowie endliche Mikrofon-/Kamera-/Hand-/Eigenpräsentationszustände | Tasten anzeigen und falsches Meeting verhindern                    | gekoppeltes Plugin auf `127.0.0.1`             | nur Arbeitsspeicher                                                                                            |
| begrenzter Befehls-Ergebnisstatus und zufällige Befehls-ID                              | Steueraktion bestätigen und zuordnen                               | Browser und gekoppeltes Plugin                 | nur Arbeitsspeicher                                                                                            |
| zufällige undurchsichtige Transport-Sitzungs-IDs                                        | lokale Nachrichten absichern und ordnen                            | Browser und gekoppeltes Plugin                 | nur Arbeitsspeicher                                                                                            |
| achtstelliger Pairingcode                                                               | bewusstes erstmaliges Koppeln                                      | Loopback-Verbindung                            | höchstens zwei Minuten                                                                                         |
| zufälliges 256-Bit-Meet-Deck-Pairing-Token                                              | spätere lokale Verbindungen authentifizieren                       | Chrome-Storage und lokale Plugin-Einstellungen | je Seite bis zum dortigen Löschen/Entkoppeln, Löschen des Speichers oder Entfernen der Software                |
| konfigurierter Loopback-Port                                                            | die gewählte lokale Plugin-Origin finden                           | Chrome-Storage                                 | bis Änderung, Löschen des Extension-Speichers oder Entfernen der Extension; **Pairing löschen** behält ihn bei |
| exakte Chrome-Hostfreigabe für den Port                                                 | ausschließlich die gewählte lokale Plugin-Origin erlauben          | Chrome-Berechtigungsspeicher                   | bis Bereinigung nach Portwechsel, **Pairing löschen**, Widerruf oder Entfernen der Extension                   |

Das Content Script vergleicht Accessibility-Labels sichtbarer Schaltflächen flüchtig mit einer
festen englisch/deutschen Positivliste und liest nur die Statusattribute, aus denen endliche
Steuerwerte entstehen. Chrome liefert außerdem aktuelle Sender-URL und Tab-/Dokumentidentität. Meet
Deck nutzt sie ausschließlich, um ein aktives Top-Level-Dokument von `https://meet.google.com` zu
prüfen, und kopiert weder URL noch Pfad in den Produktzustand.

Von diesen Google-Meet-Informationen empfängt das gekoppelte Plugin nur `meetingMultiplicity`
(`none`, `one` oder `multiple`), die endlichen Werte `microphone`, `camera`, `hand` und
`selfPresentation` sowie einen begrenzten `result`-Status mit undurchsichtiger Befehls-ID.
Accessibility-Labels, Sender-/Tab-/Dokument-IDs, Meet-URLs/-Codes, Titel, Teilnehmer,
Kommunikations- und Mediendaten gelangen nie in die Loopback-Anwendungsnachrichten. Zufälliges
Pairing-/Authentifizierungsmaterial und Transport-IDs werden davon getrennt zur Absicherung und
Zuordnung der lokalen Verbindung übertragen; sie stammen weder aus einem Meeting noch aus einem
Google-Account.

## Bewusst nicht abgerufene, gespeicherte oder geteilte Daten

Meet Deck greift weder auf Google-Account-Zugangsdaten, Passwörter, Cookies, OAuth-Zugangsdaten,
Google-Authentifizierungs-/Sitzungstoken noch auf eine Google-API zu. Abgesehen von der oben
beschriebenen flüchtigen Sender-Origin-Prüfung speichert oder protokolliert Meet Deck die folgenden
Daten nicht und sendet sie nicht an das Plugin:

- Meeting-URLs/-Codes, Titel, Kalendereinträge oder Account-Identität;
- Teilnehmernamen, Profilbilder, Anwesenheit, Reaktionen oder Präsenzdaten;
- Chats, Untertitel, Transkripte, Aufzeichnungen oder Dateien;
- Audio, Video, Screenshots, übertragene Bildschirmpixel oder Namen ausgewählter Freigabequellen;
- Browserverlauf oder Google-Account-/Authentifizierungsinformationen;
- Analytics, Crash-Telemetrie, Nutzungsmetriken oder Werbe-IDs.

Das lokal gespeicherte Meet-Deck-Pairing-Token ist von einer Google-/Account-Authentifizierung zu
unterscheiden. Das Stream-Deck-Plugin erzeugt diesen zufälligen 256-Bit-Wert erst nach Annahme des
Einmalcodes. Er liegt ausschließlich in `chrome.storage.local` und den Stream-Deck-Global-Settings,
dient nur der gegenseitigen Authentifizierung der Loopback-Bridge und wird nie an Google oder einen
entfernten Dienst gesendet.

## Browserzugriff

Das Content Script ist auf `https://meet.google.com/*` beschränkt. Mit `storage` hält die
Erweiterung das Meet-Deck-Pairing-Token und lokale Konfiguration. `alarms` plant nach einer Pause
des MV3-Workers einen lokalen Reconnect-/Wecktermin mit festem Namen; Chrome-Alarme enthalten nur
Name und Zeitplan, keine Meeting-, Steuer- oder Authentifizierungsdaten und keine beliebigen
Payloads. Der Alarm-Callback versucht ausschließlich, die Loopback-Verbindung erneut herzustellen.

Bei **Koppeln und verbinden** oder **Verbinden** ruft die Erweiterung Chromes optionale
Hostberechtigungsanfrage für den exakten konfigurierten Ursprung
`ws://127.0.0.1:<konfigurierter Port>` auf. Dabei verwendet sie das Match-Pattern
`ws://127.0.0.1:<konfigurierter Port>/*`. Die Anfrage erfolgt direkt durch diese eindeutige
Nutzeraktion statt bei der Installation und gewährt weder Zugriff auf LAN-Adressen, `localhost`,
andere Loopback-Adressen, entfernte Hosts noch alle URLs. Das notwendige `/*` gehört zu Chromes
Match-Pattern-Syntax; Schema, Host und Port enthalten keine Wildcards. Ist die exakte Origin bereits
freigegeben, beendet Chrome die Anfrage ohne neue Abfrage. Die Meet-Deck-CSP erlaubt unabhängig
weiterhin nur `ws://127.0.0.1:*`; die Bridge verbindet sich über
`ws://127.0.0.1:<konfigurierter Port>/v1`.

Bei Ablehnung bleibt Meet Deck offline. Nach einem späteren Widerruf wird die nächste Verbindung
oder Wiederverbindung blockiert; Meet Deck behauptet nicht, dass Chrome einen bereits geöffneten
WebSocket sofort schließt. Keiner der Zustände löst eine Retry-Umgehung oder einen Remote-Fallback
aus. **Koppeln und verbinden** oder **Verbinden** kann die Freigabe erneut anfragen. Eine zuvor
genehmigte optionale Freigabe kann Chrome ohne erneute Abfrage wiederherstellen. Ein Portwechsel
ändert die Origin und erfordert daher eine Freigabe für exakt diesen neuen Port; eine bereits
erteilte passende Freigabe setzt die Verbindung ohne neue Abfrage fort. Nach dem Speichern des neuen
Ports entfernt Meet Deck die überholte exakte Portfreigabe und meldet, wenn Chrome diese Bereinigung
nicht abschließen konnte.

Meet Deck fordert weder `tabs`, `cookies`, `identity`, `webRequest`, Netzwerkinspektion, Debugging,
Desktop Capture, Mikrofon- noch Kamerarechte an.

Inkognito-Nutzung ist deaktiviert. Das gekoppelte Token bleibt im bewusst gewählten regulären
Chrome-Profil.

## Bildschirmfreigabe

Meet Deck darf die Meet-Oberfläche „Jetzt präsentieren“ öffnen, aber keine Quelle auswählen oder
erfassen. Chrome und macOS verlangen im eigenen Picker die bewusste Auswahl eines Bildschirms,
Fensters oder Tabs. Picker-Inhalte und übertragene Pixel werden von Meet Deck weder empfangen noch
gespeichert.

## Kontrolle und Löschung

**Pairing löschen** in der Chrome-Erweiterung oder **Entkoppeln** im Stream-Deck-Property-Inspector
macht die lokale Beziehung auf der jeweiligen Seite ungültig. **Pairing löschen** entfernt das Token
der Erweiterung und deren aktuelle exakte Portfreigabe, behält jedoch den konfigurierten Port.
**Entkoppeln** löscht die Tokenkopie des Plugins, kann aber weder Chrome-Speicher noch
Chrome-Berechtigungen ändern. Für einen vollständigen Reset beide Bedienelemente verwenden.

Die Chrome-Freigabe kann außerdem über Chromes Extension-Zugriffseinstellungen widerrufen werden;
das blockiert zukünftige Verbindungen und Wiederverbindungen, ohne andere Browserdaten zu löschen.
Das Entfernen über `chrome://extensions` löscht den von Chrome verwalteten Extension-Speicher samt
Freigaben. Das Plugin wird über die Stream-Deck-App entfernt. Backups von Chrome/macOS unterliegen
diesen Produkten.

Mangels Meet-Deck-Server existieren kein entferntes Nutzerkonto und keine serverseitigen Daten zum
Exportieren oder Löschen.

## Eingeschränkte Nutzung im Chrome Web Store

Meet Decks Nutzung und Übertragung von Nutzerdaten entspricht der
[Nutzerdatenrichtlinie des Chrome Web Store einschließlich der Limited-Use-Anforderungen](https://developer.chrome.com/docs/webstore/program-policies/limited-use/).
Meet Deck verwendet aus Google Meet erhaltene Informationen ausschließlich für den angegebenen
alleinigen Zweck: die lokale Stream-Deck-Steuerung von Google Meet. Die Informationen werden weder
verkauft noch an Dritte oder entfernte Dienste übertragen und nicht für Werbung, Profiling,
Kreditwürdigkeitsentscheidungen oder andere Zwecke genutzt. Meet Deck besitzt keinen Server und kein
Remote-Logging, über die der Herausgeber oder ein anderer Mensch die Informationen lesen könnte.

## Änderungen und Fragen

Wesentliche Datenschutzänderungen erfordern ein dokumentiertes Release und aktualisierte
Store-Angaben. Datenschutzprobleme gemäß Security-Hinweisen des Repositories melden und dabei
niemals echte Meetinglinks/-codes, Namen, Chats, Untertitel oder Medien mitsenden.
