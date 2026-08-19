# Hardware-End-to-End-Abnahme

Diese Checkliste gilt vor jedem öffentlichen Release. Sie prüft echtes Stream Deck, Desktop-App,
Chrome-Sicherheitsdialoge, Meet-DOM, Loopback-Bridge und MV3-Lebenszyklus – Grenzen, die Unit-Tests
nicht vollständig abdecken.

## Testprotokoll

Ohne Meetingdaten erfassen:

- Release-Tag/-Commit und SHA-256 beider Artefakte;
- Mac-Modell und macOS-Version;
- Stream-Deck-Modell/Firmware und Desktop-App-Version;
- Chrome-Version und Installationsart (entpackt/Store);
- Meet-Sprache (`en`/`de`), Datum, Tester, Ergebnis und bereinigte Notizen.

Ein dediziertes Testmeeting mit synthetischen Identitäten verwenden. Screenshots und Logs dürfen
keine echten Codes, URLs, Kalendertitel, Teilnehmer, Chats, Untertitel, Vorschaubilder oder
Freigabeinhalte enthalten.

## Saubere Installation und Kopplung

1. Alte Installation entfernen/entkoppeln, Kandidatenartefakte installieren und Checksummen prüfen.
2. Vier LCD-Aktionen anlegen. Offline-/ungekoppelten Zustand prüfen; Tastendrücke dürfen keine
   Browseraktion auslösen.
3. Pairing öffnen: exakt acht Stellen, Ablauf nach zwei Minuten und Ablehnung danach prüfen.
4. Fünf falsche Codes senden: Pairing muss schließen/drosseln und nur bewusst wieder geöffnet werden
   können.
5. Die erstmalige Ablehnung in einem sauberen Chrome-Profil/einer frischen Installation oder mit
   einem noch nie genehmigten gültigen Testport prüfen. Neues Pairingfenster öffnen, Code eingeben,
   **Koppeln und verbinden** wählen und Chromes Abfrage für `ws://127.0.0.1:<konfigurierter Port>/*`
   ablehnen. Das Pairing darf nicht abgeschlossen werden; die Erweiterung muss ohne
   Reconnect-Schleife oder Remote-Verbindung offline bleiben. Diesen Fall nicht durch Entfernen
   einer früher genehmigten optionalen Freigabe erzeugen: Chrome kann sie ohne Abfrage
   wiederherstellen.
6. Pairing gegebenenfalls erneut öffnen, **Koppeln und verbinden** wählen und das exakte
   Port-Match-Pattern erlauben. Beidseitig **Verbunden** prüfen. Die Freigabe darf weder
   Wildcard-Schema/-Host/-Port noch LAN, `localhost` oder alle URLs umfassen. Der WebSocket
   verwendet dieselbe Origin mit `/v1`.
7. Durch Beenden des lokalen Plugins/der Bridge einen gekoppelten, aber getrennten Zustand erzeugen.
   Während das Popup **Verbinden** zeigt, die Schaltfläche wählen und prüfen, dass für die bereits
   erteilte Origin keine neue Berechtigungsabfrage erscheint. Plugin neu starten und
   Wiederherstellung bestätigen.
8. Loopback-Hostfreigabe widerrufen und durch Stoppen/Neustarten des lokalen Plugins/der Bridge eine
   neue Verbindung erzwingen. Die nächste Verbindung/Wiederverbindung muss ohne Reconnect-Schleife
   oder Remote-Kontakt blockiert sein; Chrome muss keinen beim Widerruf bereits geöffneten WebSocket
   sofort schließen. **Verbinden** wählen und Wiederherstellung bestätigen. Chrome kann eine früher
   genehmigte optionale Freigabe ohne neue Abfrage wiederherstellen; daher die resultierende exakte
   Portfreigabe prüfen statt einen Dialog vorauszusetzen.
9. Extension-Port ändern und speichern, dann das Plugin auf denselben neuen gültigen Port stellen.
   Das Speichern allein muss das Pairing trennen und die alte Freigabe entfernen, darf aber keine
   Berechtigungsabfrage öffnen. **Verbinden** wählen; nur `ws://127.0.0.1:<konfigurierter Port>/*`
   für den neuen Port darf angefragt werden. Prüfen, dass die alte Freigabe entfernt ist oder Meet
   Deck einen Bereinigungsfehler ausdrücklich meldet. Auch der Rückwechsel darf die freigegebenen
   Hosts nicht verbreitern.

## Meeting-Ziel

1. Ohne Meet-Tab alle Tasten drücken: keine Aktion, verständlicher Status.
2. Auf einer Pre-Join-Seite wiederholen: sie darf nicht als beigetreten zählen.
3. Einem Testmeeting beitreten: alle vier Tasten zeigen binnen einer Sekunde einen bekannten
   Zustand.
4. Zweitem Meeting beitreten: alle Befehle werden als mehrdeutig blockiert, in keinem Meeting
   erfolgt ein Klick.
5. Zweites Meeting verlassen: erstes wird ohne erneutes Pairing steuerbar.

## Zustands-/Befehlsmatrix

Für Mikrofon, Kamera und Hand beide Richtungen aus jeder Quelle testen:

| Quelle                      | Erwartung                                                           |
| --------------------------- | ------------------------------------------------------------------- |
| Stream-Deck-Taste           | Meet ändert sich genau einmal; Taste bestätigt binnen einer Sekunde |
| sichtbare Meet-Schaltfläche | alle zugehörigen Deck-Tasten folgen binnen einer Sekunde            |
| offizieller Meet-Kurzbefehl | alle zugehörigen Deck-Tasten folgen binnen einer Sekunde            |

Tasten halten und schnell mehrfach drücken. Zuordnung von Befehl/Ergebnis muss Oszillation,
Doppelklick und falsches End-Icon verhindern. Mehrere Instanzen derselben Aktion zeigen stets
denselben bestätigten Zustand.

Wenn möglich, ein Element per Meetingrichtlinie deaktivieren: Taste zeigt blockiert/unbekannt und
versucht kein alternatives Element.

## Präsentationsmatrix

1. Bei inaktivem Zustand drücken: Meet öffnet Freigabefluss, wählt aber niemals selbst
   Bildschirm/Fenster/Tab.
2. Picker abbrechen: keine Freigabe, Taste wieder inaktiv.
3. Synthetische Quelle wählen und bestätigen: Taste erst nach Meet-Bestätigung aktiv.
4. Aktiv erneut drücken: nur eigene Präsentation endet.
5. In Meet selbst starten/stoppen: Taste folgt binnen einer Sekunde.
6. Browser-blockierten Pfad testen: `needs_user_action`, Fokus des eindeutigen Meet-Tabs,
   offizieller Kurzbefehl und weiterhin zwingende Picker-Bestätigung.
7. Präsentiert jemand anderes, darf die Taste keine eigene Freigabe anzeigen und die fremde
   Präsentation nicht beenden.

## Lebenszyklus und Fehler

- Meet neu laden, innerhalb der SPA navigieren, Tab schließen/öffnen.
- Extension neu laden/deaktivieren/aktivieren und MV3-Worker pausieren lassen. Bei nicht
  erreichbarer Bridge prüfen, dass der feste Reconnect-Alarm den Worker weckt und nur Loopback neu
  versucht.
- Chrome und Stream-Deck-App jeweils beenden/starten.
- Stream Deck per USB trennen/verbinden.
- Port beidseitig ändern und Portkonflikt testen.
- Ungültigen/zu großen lokalen Frame senden: Ablehnung, begrenzte Ressourcen, kein Secret-Log und
  anschließende Erholung prüfen.
- Englische und deutsche UI testen. Unbekannte Sprache/Layout muss mit `unsupported_ui` scheitern
  und darf nicht raten.

Nach Reconnect authentifiziert sich jede neue Verbindung, bevor ein Befehl akzeptiert wird. Der
Listener bleibt ausschließlich auf `127.0.0.1`.

## Datenschutzbeobachtung

Loopback-WebSocket in einem kontrollierten Test-Build aufzeichnen. Zulässig sind nur
Protokollversion/-typ, undurchsichtige IDs/Nonces/Sitzung, Richtung/Sequenz, endliche
Steuerzustände, Meeting-Vielfachheit, Ergebniscodes sowie Auth-/MAC- Material. Auth-/MAC-Material in
gespeicherten Nachweisen schwärzen. Nach der Authentifizierung dürfen Anwendungsmeldungen nur in
gültigen geschützten Envelopes akzeptiert werden; wiederholte Sequenzen müssen scheitern.

Logs nach synthetischer URL/Code, Titel, Teilnehmer, Chat, Untertiteln und Quellenname durchsuchen:
kein Treffer. Meet Deck darf neben Loopback keinen externen Endpunkt kontaktieren; Googles eigener
Meet-Traffic gehört nicht zur Erweiterung.

`chrome.alarms` prüfen: Nur der feste Meet-Deck-Reconnect-Name und sein Zeitplan dürfen existieren.
Der Alarm enthält keine Meeting-/Steuer-/Authentifizierungs-Payload und wird nach erfolgreichem
Reconnect beziehungsweise ohne Reconnect-Bedarf gelöscht.

## Release-Freigabe

Der Kandidat besteht nur, wenn alle anwendbaren Fälle in englischer und deutscher UI erfolgreich
sind, keine Security-/Privacy-Invariante verletzt ist und Fehler sicher und verständlich bleiben.
Das bereinigte Protokoll dem Release-Prozess beifügen. Fehler bei Pairing, Zielmehrdeutigkeit,
Freigabezustimmung, Zustandskorrektheit oder Datensparsamkeit dürfen nicht überstimmt werden.
