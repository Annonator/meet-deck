# Privacy notice

**Publisher:** annonator  
**Product:** Meet Deck (`dev.annonator.meet-deck`)  
**Applies to:** Stream Deck plugin and Chrome extension

## Plain-language summary

Meet Deck controls a small set of Google Meet buttons through software running on the same Mac. It
has no server, account, cloud synchronisation, telemetry, analytics, advertising, or remote logging.
Meeting content never needs to leave the browser, and it is not sent to the Stream Deck plugin.

## Data handled

| Data                                                  | Purpose                                   | Destination                                        | Retention                                                  |
| ----------------------------------------------------- | ----------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| Microphone/camera/hand/self-presentation finite state | Render keys and confirm commands          | Paired plugin on `127.0.0.1`                       | Memory only                                                |
| Meeting multiplicity (`none`, `one`, `multiple`)      | Avoid controlling no or multiple meetings | Paired plugin on `127.0.0.1`                       | Memory only                                                |
| Random opaque session and command IDs                 | Order and correlate local messages        | Browser and paired plugin                          | Memory only                                                |
| Eight-digit pairing code                              | User-authorised initial pairing           | Loopback connection                                | At most two minutes                                        |
| Random 256-bit pairing token                          | Authenticate later local connections      | Chrome extension storage and local plugin settings | Until unpaired, storage is cleared, or software is removed |
| Configured loopback port                              | Find the local plugin                     | Local settings only                                | Until changed or software is removed                       |

The opaque transport session ID and command IDs are randomly generated. They are not derived from a
meeting URL, code, title, participant, or account.

## Data deliberately not collected

Meet Deck does not collect, transmit, store, or log:

- meeting URLs, joining codes, titles, calendar events, or account identity;
- participant names, profile images, attendance, reactions, or presence;
- chat messages, captions, transcripts, recordings, or files;
- audio, video, screenshots, shared-screen pixels, or selected share-source names;
- browsing history, cookies, authentication tokens, or Google credentials;
- IP-based analytics, crash telemetry, usage metrics, or advertising IDs.

## Browser access

The content script is restricted to `https://meet.google.com/*`. The extension's `storage`
permission keeps the pairing token and local configuration. Its `alarms` permission schedules a
fixed-name, local bridge reconnect/wakeup after the MV3 worker is suspended; Chrome alarms carry
only a name and schedule, not meeting state, control state, authentication data, or arbitrary
payloads. The alarm callback only retries the loopback connection.

Meet Deck does not request broad website access, the Chrome `tabs` permission, cookies, network
inspection, debugging, desktop capture, microphone, or camera permissions.

Incognito use is disabled. The paired token stays in the single regular Chrome profile selected by
the user.

Chrome may request Local Network Access before allowing a WebSocket to `127.0.0.1`. This permission
reaches only the local Meet Deck bridge; Meet Deck does not use it to scan the LAN and has no remote
fallback.

## Screen sharing

Meet Deck may activate Meet's “Present” user interface, but it cannot select or capture a source.
Chrome and macOS show their own picker and require the user to confirm a screen, window, or tab.
Meet Deck neither receives nor records the picker contents or shared pixels.

## User control and deletion

Use **Unpair** in either UI to invalidate the local relationship. Remove the extension from
`chrome://extensions` to delete its Chrome-managed local storage; remove the plugin through the
Stream Deck app to delete the plugin installation. Chrome/operating-system backups are governed by
those products, not Meet Deck.

Because there is no Meet Deck server, there is no remote personal-data account or server-side data
to export or delete.

## Changes and questions

Material privacy changes require a documented release and updated store disclosures. Report a
privacy issue through the repository's security reporting instructions; do not include real meeting
links, codes, names, chat, captions, or media in a report.
