# Privacy notice

**Publisher:** annonator  
**Product:** Meet Deck (`dev.annonator.meet-deck`)  
**Applies to:** Stream Deck plugin and Chrome extension

[Deutsche Fassung](../de/privacy.md)

## Plain-language summary

Meet Deck controls a small set of Google Meet buttons through software running on the same Mac. It
has no server, account, cloud synchronisation, telemetry, analytics, advertising, or remote logging.
The extension examines only the visible control signals needed for that purpose. Of the information
observed in Google Meet, only the minimum derived meeting/control state and bounded command results
are sent to the paired local Stream Deck plugin.

## Data handled

| Data                                                                             | Purpose                                                          | Destination                                         | Retention                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Visible Meet button accessibility labels and control-state attributes            | Recognise supported controls and whether the document joined     | Chrome extension only                               | Transient; not copied to settings, logs, or the local wire                                              |
| Chrome-supplied sender URL/origin and opaque tab/window/document IDs             | Validate an active top-level Meet sender and target one document | Chrome extension only                               | Connection memory; URL/path is not copied to product state                                              |
| `meetingMultiplicity` plus finite microphone/camera/hand/self-presentation state | Render keys and avoid the wrong meeting                          | Paired plugin on `127.0.0.1`                        | Memory only                                                                                             |
| Bounded command-result status and random command ID                              | Confirm and correlate a requested control action                 | Browser and paired plugin                           | Memory only                                                                                             |
| Random opaque transport session IDs                                              | Secure and order local messages                                  | Browser and paired plugin                           | Memory only                                                                                             |
| Random 125-bit one-time pairing key                                              | User-authorised initial pairing and first-peer authentication    | Plugin and extension memory; never sent on loopback | Plugin window: at most two minutes; extension: only during the foreground attempt                       |
| Random 256-bit Meet Deck pairing credential                                      | Authenticate later local connections                             | Chrome extension storage and local plugin settings  | On each side until that side forgets/unpairs, its storage is cleared, or its software is removed        |
| Configured loopback port                                                         | Find the selected local plugin origin                            | Chrome extension storage                            | Until changed, extension storage is cleared, or the extension is removed; **Forget pairing** retains it |
| Exact-port Chrome host grant                                                     | Permit only the selected local plugin origin                     | Chrome permission store                             | Until port-change cleanup, **Forget pairing**, user revocation, or extension removal                    |

The content script transiently compares visible button accessibility labels with a fixed English/
German allowlist and reads only the state attributes needed to derive finite control values. Chrome
also supplies the current sender URL and tab/document identity; Meet Deck uses them only to validate
that a message came from an active, top-level `https://meet.google.com` document and does not copy
the URL or path into product state.

Of that Google Meet information, the paired plugin receives only `meetingMultiplicity` (`none`,
`one`, or `multiple`), the finite `microphone`, `camera`, `hand`, and `selfPresentation` values, and
a bounded `result` status with an opaque command ID. Accessibility labels, sender/tab/document IDs,
Meet URLs and codes, titles, participants, communications, and media never enter the loopback
application messages. Random pairing/authentication material and transport IDs travel separately to
secure and correlate the local connection; they are not derived from a meeting or Google account.

## Data deliberately not accessed, retained, or shared

Meet Deck does not access Google account credentials, passwords, cookies, OAuth credentials, Google
authentication/session tokens, or any Google API. Except for the transient sender-origin validation
described above, Meet Deck does not retain or log the following data and does not send it to the
plugin:

- meeting URLs, joining codes, titles, calendar events, or account identity;
- participant names, profile images, attendance, reactions, or presence;
- chat messages, captions, transcripts, recordings, or files;
- audio, video, screenshots, shared-screen pixels, or selected share-source names;
- browsing history or Google account/authentication information;
- IP-based analytics, crash telemetry, usage metrics, or advertising IDs.

The locally stored Meet Deck pairing credential is distinct from Google/account authentication. The
Stream Deck plugin generates this random 256-bit value only after both sides prove possession of the
one-time pairing key without sending that key over the socket. It is stored only in
`chrome.storage.local` and Stream Deck global settings, used solely for mutual authentication of the
loopback bridge, and never sent to Google or a remote service.

## Browser access

The content script is restricted to `https://meet.google.com/*`. The extension's `storage`
permission keeps the Meet Deck pairing credential and local configuration. Its `alarms` permission
schedules a fixed-name, local bridge reconnect/wakeup after the MV3 worker is suspended; Chrome
alarms carry only a name and schedule, not meeting state, control state, authentication data, or
arbitrary payloads. The alarm callback only retries the loopback connection.

When the user chooses **Pair and connect** or **Connect**, the extension calls Chrome's optional
host-permission request for the exact configured `ws://127.0.0.1:<configured port>` origin,
expressed as the match pattern `ws://127.0.0.1:<configured port>/*`. It happens directly from that
clear user gesture rather than at installation and does not grant access to LAN addresses,
`localhost`, other loopback addresses, remote hosts, or all URLs. The required `/*` is Chrome
match-pattern syntax; the request contains no wildcard scheme, host, or port. If the exact origin is
already granted, Chrome completes the request without another prompt. Meet Deck's CSP independently
permits only `ws://127.0.0.1:*`, and the bridge transport connects to
`ws://127.0.0.1:<configured port>/v1`.

If access is denied, Meet Deck remains offline. If it is revoked, the next connection or reconnect
is blocked; Meet Deck does not claim that Chrome will close an already-open WebSocket immediately.
Neither state starts a retry workaround or remote fallback. Choosing **Pair and connect** or
**Connect** again can request access again. Chrome can restore a previously approved optional grant
without another prompt. Changing the configured port changes the origin and therefore requires a
grant for that new exact port; an already-granted matching origin continues without another prompt.
Once the new port is saved, Meet Deck removes the superseded exact-port grant and reports if Chrome
could not complete that cleanup.

Meet Deck does not request the Chrome `tabs`, `cookies`, `identity`, `webRequest`, network
inspection, debugging, desktop capture, microphone, or camera permissions.

Incognito use is disabled. The paired token stays in the single regular Chrome profile selected by
the user.

## Screen sharing

Meet Deck may activate Meet's “Present” user interface, but it cannot select or capture a source.
Chrome and macOS show their own picker and require the user to confirm a screen, window, or tab.
Meet Deck neither receives nor records the picker contents or shared pixels.

## User control and deletion

Choose **Forget pairing** in the Chrome extension or **Unpair** in the Stream Deck property
inspector to invalidate the local relationship on that side. **Forget pairing** removes the
extension's credential and current exact-port host grant but retains the configured port. **Unpair**
removes the plugin's copy of the credential but cannot alter Chrome storage or permissions. Use both
controls for a complete two-sided reset.

The Chrome grant can also be revoked through Chrome's extension access controls; this blocks future
connections/reconnects without deleting unrelated browser data. Removing the extension from
`chrome://extensions` deletes its Chrome-managed storage and grants. Removing the plugin through the
Stream Deck app deletes the plugin installation. Chrome/operating-system backups are governed by
those products, not Meet Deck.

Because there is no Meet Deck server, there is no remote personal-data account or server-side data
to export or delete.

## Chrome Web Store Limited Use

Meet Deck's use and transfer of user data complies with the
[Chrome Web Store User Data Policy, including the Limited Use requirements](https://developer.chrome.com/docs/webstore/program-policies/limited-use/).
Meet Deck uses information obtained from Google Meet only to provide its disclosed single purpose:
local Stream Deck control of Google Meet. It does not sell the information, transfer it to a third
party or remote service, or use it for advertising, profiling, determining creditworthiness, or any
unrelated purpose. Meet Deck has no server or remote logging through which the publisher or another
human can read it.

## Changes and questions

Material privacy changes require a documented release and updated store disclosures. Report a
privacy issue through the repository's security reporting instructions; do not include real meeting
links, codes, names, chat, captions, or media in a report.
