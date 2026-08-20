# Pre-tag hardware/browser acceptance — 2026-08-19

## Release-owner hardware validation addendum — 2026-08-20

**PASS for the GitHub release hardware gate.** The release owner confirmed that the installed fixed
Stream Deck plugin and updated unpacked companion work on the physical hardware path. Current-state
checks additionally established that:

- Microsoft Edge loaded Meet Deck `0.1.0` from the verified `apps/chrome-extension/dist` directory
  and the updated popup ran successfully.
- The installed Stream Deck plugin's `plugin.js` and Property Inspector JavaScript matched the
  verified build byte-for-byte.
- The genuine plugin owned the configured IPv4 loopback listener at `127.0.0.1:53421`.

This owner acceptance supersedes the original report's GitHub-release hardware NO-GO. The observed
browser was Microsoft Edge; it does not mark the historical per-row Google Chrome matrix below as
run and does not satisfy the separate Chrome Web Store submission acceptance requirements. The
original 2026-08-19 observations remain preserved below.

## Verdict

**NO-GO — real hardware/browser acceptance is incomplete.** The integrated candidate builds,
packages, validates, and passes 183 automated tests. The local bridge was observed listening only on
IPv4 loopback, and the running plugin JavaScript was byte-identical to the packed candidate.
However, the Mac UI was locked and could not be unlocked automatically, the stable-Chrome browser
control helper was unavailable, and the packed plugin still required an observed replacement
confirmation. Every affected check below is therefore `NOT RUN`; no physical or browser result is
inferred from unit tests.

A release candidate passes only after every applicable live case passes in both English and German
Meet and no privacy or security invariant fails.

## Candidate and provenance

| Item                                | Recorded value                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| Execution window                    | 2026-08-19T12:25:00+02:00 through 2026-08-19T13:20:11+02:00                      |
| Baseline                            | `fc60d9649d27420a2e07bc8631d5c12042ae1a20`                                       |
| Chrome dependency task              | `01a01989-9640-7ca2-b939-e2f1ddec9326`                                           |
| Chrome upstream commit              | `17df7466b126d06bda153a17460ffa78486e08c4`                                       |
| Chrome local cherry-pick            | `9b4305a061252a771e0b11a0b721f7df5706ddb4`                                       |
| Chrome upstream/local patch ID      | `3e19fe664937c1cf36a2a3cda326a1a64a104660`                                       |
| Stream Deck dependency task         | `01a01989-963f-7001-b1d4-b51a9e8afd1d`                                           |
| Stream Deck upstream commit         | `75d7d1e67f0d5bcc2e2dc74c87c87483bf930571`                                       |
| Stream Deck local cherry-pick       | `554732dc18dd8079a7a86be58c510f5719851132`                                       |
| Stream Deck upstream/local patch ID | `81a26f555323c72fe12d21f43e54cdba28c1296c`                                       |
| Focused acceptance fix              | `9d7659bf7606f0977f242dd121d8287088a09bbe`                                       |
| Tested implementation               | `9d7659bf7606f0977f242dd121d8287088a09bbe`                                       |
| Cherry-pick order                   | Chrome, then Stream Deck, then the focused documentation/test fix                |
| Candidate versions                  | Chrome/root `0.1.0`; Stream Deck `0.1.0.0`; no tag created                       |
| Report commit                       | The commit containing this report; its exact SHA is recorded in the task handoff |

The two dependency task finals were read before integration. Both upstream patches were
cherry-picked by their exact SHAs in the required order, and patch-ID comparison proves the local
commits contain the same changes despite their new parent commits.

## Sanitized environment record

| Component                     | Observed value                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------- |
| Host                          | MacBook Pro `Mac15,10`, Apple M3 Max, 96 GB, arm64                              |
| Operating system              | macOS 26.6.1, build 25G76                                                       |
| Build runtime                 | Node.js 24.13.1; npm 11.19.0                                                    |
| Stable Chrome                 | 151.0.7922.169, installed and running                                           |
| Chrome candidate installation | Not performed; installation type and candidate runtime state not observed       |
| Browser-control state         | Stable-Chrome surface unavailable; required helper extension/native host absent |
| Stream Deck hardware          | Elgato Stream Deck Plus present on USB; serial number deliberately not queried  |
| Stream Deck firmware          | Not observed because the Mac UI was locked                                      |
| Stream Deck app               | 7.5.1, build 22901, installed and running                                       |
| Installed Meet Deck plugin    | Regular installation, not a development link; manifest predates the candidate   |
| Running plugin runtime        | Bundled Node.js 24.13.1; `plugin.js` SHA-256 matched the packed candidate       |
| Bridge observation            | One listener at `127.0.0.1:53421`; no non-loopback listener observed            |
| Meet rooms/languages          | No test room opened; no live English or German Meet UI observed                 |

No meeting name, URL, code, participant, credential, pairing key, token, device serial, chat,
caption, thumbnail, or shared content was collected.

## Build and package evidence

| ID         | Result    | Check                                                      | Expected                                                          | Actual / sanitized evidence                                                                                   |
| ---------- | --------- | ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| INT-01     | `PASS`    | Wait for and read both dependency tasks                    | Both tasks complete successfully before testing                   | Both completed; exact upstream SHAs recorded above                                                            |
| INT-02     | `PASS`    | Integrate exact Chrome dependency                          | Exact upstream patch on baseline                                  | Cherry-pick completed; upstream/local patch IDs match                                                         |
| INT-03     | `PASS`    | Integrate exact Stream Deck dependency second              | Exact upstream patch after Chrome                                 | Cherry-pick completed in required order; patch IDs match                                                      |
| INT-04     | `PASS`    | Verify integrated source tree                              | Intended ordered commits and no unrelated changes                 | Clean tree at the tested implementation before report creation                                                |
| BUILD-01   | `PASS`    | Use repository-supported runtime                           | Node 24                                                           | Node 24.13.1 and npm 11.19.0                                                                                  |
| BUILD-02   | `PASS`    | `npm ci`                                                   | Clean dependency installation                                     | 291 packages installed successfully                                                                           |
| BUILD-03   | `PASS`    | `npm run check`                                            | Formatting, lint, type checks, tests, builds, and validators pass | Passed; protocol 37, Chrome 109, plugin 37: 183 tests total                                                   |
| BUILD-04   | `PASS`    | `npm run pack`                                             | Fresh validated Chrome and Stream Deck artifacts                  | Passed after the focused fix; official Stream Deck validation passed                                          |
| ART-01     | `PASS`    | Audit Chrome ZIP                                           | Valid, exact `dist` payload with no extras or corrupt members     | 17 members; CRC and byte-parity checks passed; EN/DE catalogs each contain 62 matching keys                   |
| ART-02     | `PASS`    | Audit Stream Deck package                                  | Valid safe archive matching the source bundle                     | 40 members; archive validation passed; payload matches source except canonical-equivalent manifest formatting |
| INSTALL-01 | `NOT RUN` | Install final ZIP in stable Chrome                         | Candidate runs in installed stable Chrome                         | Stable-Chrome control helper/native host unavailable                                                          |
| INSTALL-02 | `NOT RUN` | Install packed plugin through Stream Deck replacement flow | Candidate package accepted and loaded by actual app               | Mac locked; replacement dialog and resulting installed payload could not be observed                          |

### Final artifact record

| Artifact                                   | Built                     |         Size | SHA-256                                                            |
| ------------------------------------------ | ------------------------- | -----------: | ------------------------------------------------------------------ |
| `meet-deck-chrome-v0.1.0.zip`              | 2026-08-19T13:13:59+02:00 | 150870 bytes | `2640c561f8fc383bdd39678cb9c3ca6a768795fbec4e1410730bc0ce862028a4` |
| `dev.annonator.meet-deck.streamDeckPlugin` | 2026-08-19T13:14:00+02:00 | 195670 bytes | `246122567219dd37b4a6198263165ffc229970bf2225a757bd4fa8f943c74b84` |

`SHA256SUMS.txt` verified both files. The Chrome ZIP has no source maps, and static scans found no
unexpected remote code, development host pattern, or credential-like literal in either built
payload. Static evidence is not a substitute for observing the installed runtimes.

## Supporting automated acceptance evidence

These checks passed against the integrated candidate. They exercise deterministic logic only and do
not change any live hardware/browser result below from `NOT RUN`.

| ID      | Result | Automated check                                                                        | Actual evidence                                                           |
| ------- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AUTO-01 | `PASS` | Pairing key generation, proof exchange, one-use behavior, expiry, and lockout          | Protocol, Chrome, and plugin tests passed                                 |
| AUTO-02 | `PASS` | Exact IPv4 loopback permission request, denial/no-retry, revoke, and port change       | Chrome tests passed                                                       |
| AUTO-03 | `PASS` | Mutual authentication, protected envelopes, replay rejection, and session isolation    | Protocol and endpoint tests passed                                        |
| AUTO-04 | `PASS` | No/pre-join/one/multiple meeting projections and fail-closed targeting                 | Chrome and plugin tests passed                                            |
| AUTO-05 | `PASS` | Current English/German DOM fixtures and localization parity                            | Chrome tests and package audit passed                                     |
| AUTO-06 | `PASS` | Confirmed microphone/hand transitions, disabled controls, scheduling, and pending UI   | Chrome and plugin tests passed; no positive camera hardware claim is made |
| AUTO-07 | `PASS` | Presentation start/stop confirmation and `needs_user_action` handling                  | Chrome and plugin tests passed; no real picker claim is made              |
| AUTO-08 | `PASS` | Heartbeat, reconnect, permission loss, stale sessions, and credential rollback         | Chrome and plugin tests passed                                            |
| AUTO-09 | `PASS` | Invalid and over-16-KiB frame rejection                                                | Protocol and plugin tests passed                                          |
| AUTO-10 | `PASS` | Privacy-minimized schema, closed field allowlist, origin policy, and protected traffic | Protocol and endpoint tests passed                                        |
| AUTO-11 | `PASS` | Declared minimum macOS remains aligned across manifest and setup documentation         | New compatibility regression test passed                                  |

## Real hardware/browser checklist

### Clean setup and pairing

| ID       | Result    | Live check                                                      | Expected                                                                                 | Actual / blocker                                                    |
| -------- | --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| SETUP-01 | `NOT RUN` | Remove/unpair prior candidate and install both final artifacts  | Clean candidate state with verified checksums                                            | Existing user state was left untouched; UI unavailable              |
| SETUP-02 | `NOT RUN` | Add all four actions to LCD keys                                | All actions visible in unpaired/offline state                                            | Stream Deck UI locked                                               |
| SETUP-03 | `NOT RUN` | Press all unpaired/offline keys                                 | No browser action                                                                        | Physical key/UI observation unavailable                             |
| SETUP-04 | `NOT RUN` | Record hardware firmware and candidate installation state       | Firmware and exact installed payload documented                                          | Stream Deck UI locked; packed replacement not accepted              |
| PAIR-01  | `NOT RUN` | Open pairing and inspect displayed key                          | Exactly 25 unambiguous characters, grouped for readability                               | Candidate UI not installed/observable                               |
| PAIR-02  | `NOT RUN` | Wait two minutes and submit expired key                         | Expired key rejected                                                                     | Candidate UI not installed/observable                               |
| PAIR-03  | `NOT RUN` | Submit a previously accepted key again                          | Replayed key rejected                                                                    | No live pair completed                                              |
| PAIR-04  | `NOT RUN` | Submit five invalid client proofs                               | Pairing closes or rate-limits on fifth attempt                                           | Candidate UI not installed/observable                               |
| PAIR-05  | `NOT RUN` | Open a new explicit pairing window after lockout                | Pairing becomes available again only explicitly                                          | Candidate UI not installed/observable                               |
| PAIR-06  | `NOT RUN` | First-time deny on a clean or never-approved exact port         | Chrome displays the exact loopback permission prompt                                     | Stable Chrome unavailable to automation; no clean candidate profile |
| PAIR-07  | `NOT RUN` | Observe behavior after denial                                   | Pairing remains incomplete, offline, without retry storm or remote contact               | Live Chrome/network observation unavailable                         |
| PAIR-08  | `NOT RUN` | Retry and approve from a new pairing window                     | Both sides show Connected                                                                | Live Chrome and plugin UI unavailable                               |
| PAIR-09  | `NOT RUN` | Inspect approved host grant                                     | Exact scheme, IPv4 host, and port only; no LAN, `localhost`, wildcard, or all-URL access | Chrome permissions UI unavailable                                   |
| PAIR-10  | `NOT RUN` | Stop bridge, press Connect with already granted origin, restart | No new prompt; automatic recovery                                                        | Changing live user runtime was not justified without observable UI  |
| PAIR-11  | `NOT RUN` | Revoke loopback grant and force reconnect                       | Reconnect blocked without retry storm or remote contact                                  | Chrome permissions/network UI unavailable                           |
| PAIR-12  | `NOT RUN` | Press Connect after revocation                                  | Recovery with exact-port grant                                                           | Chrome candidate UI unavailable                                     |
| PAIR-13  | `NOT RUN` | Save a new extension port                                       | Disconnects, removes old grant, and opens no prompt                                      | Chrome candidate UI unavailable                                     |
| PAIR-14  | `NOT RUN` | Configure matching plugin port and press Connect                | Only new exact-port origin requested; connection recovers                                | Both candidate UIs unavailable                                      |
| PAIR-15  | `NOT RUN` | Change back to the original port                                | Old grant absent or cleanup failure explicit; grant set never broadens                   | Both candidate UIs unavailable                                      |
| PAIR-16  | `NOT RUN` | Unpair final candidate and inspect stored state                 | Pairing credentials removed; keys remain offline and inert                               | No final live pair; candidate storage not observable                |

### Meeting targeting

| ID        | Result    | Live check                                | Expected                                      | Actual / blocker                        |
| --------- | --------- | ----------------------------------------- | --------------------------------------------- | --------------------------------------- |
| TARGET-01 | `NOT RUN` | Press every key with no Meet tab          | No action and clear no-meeting state          | No candidate runtime control            |
| TARGET-02 | `NOT RUN` | Press every key on pre-join page          | Page is not treated as joined                 | No synthetic test room/browser control  |
| TARGET-03 | `NOT RUN` | Join one test meeting                     | Four keys reach known state within one second | No synthetic test room/browser control  |
| TARGET-04 | `NOT RUN` | Join a second meeting and press every key | Ambiguous state; no click in either meeting   | No synthetic test rooms/browser control |
| TARGET-05 | `NOT RUN` | Leave second meeting                      | First meeting recovers without re-pairing     | No synthetic test rooms/browser control |

### State and command matrix

Each action row requires both directions and a confirmed final state within one second.

| ID      | Result    | Live check                                   | Expected                                          | Actual / blocker                             |
| ------- | --------- | -------------------------------------------- | ------------------------------------------------- | -------------------------------------------- |
| CTRL-01 | `NOT RUN` | Microphone from Stream Deck key              | Meet changes once; key confirms final state       | No candidate hardware/browser control        |
| CTRL-02 | `NOT RUN` | Microphone from visible Meet control         | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-03 | `NOT RUN` | Microphone from official Meet shortcut       | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-04 | `NOT RUN` | Camera from Stream Deck key                  | Meet changes once; key confirms final state       | No candidate hardware/browser control        |
| CTRL-05 | `NOT RUN` | Camera from visible Meet control             | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-06 | `NOT RUN` | Camera from official Meet shortcut           | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-07 | `NOT RUN` | Hand raise/lower from Stream Deck key        | Meet changes once; key confirms final state       | No candidate hardware/browser control        |
| CTRL-08 | `NOT RUN` | Hand raise/lower from visible Meet control   | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-09 | `NOT RUN` | Hand raise/lower from official Meet shortcut | Every matching Deck key follows                   | No synthetic test room/browser control       |
| CTRL-10 | `NOT RUN` | Hold and rapidly press each Deck key         | No oscillation, double click, or false final icon | Physical key/browser observation unavailable |
| CTRL-11 | `NOT RUN` | Duplicate each action across pages/profiles  | All copies show the same confirmed state          | Stream Deck UI locked                        |
| CTRL-12 | `NOT RUN` | Disable a control by policy/permission       | Blocked/unknown; no alternate element guessed     | No controlled Meet policy/test room          |

### Presentation matrix

| ID         | Result    | Live check                                       | Expected                                                                                | Actual / blocker                             |
| ---------- | --------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| PRESENT-01 | `NOT RUN` | Press Presentation while inactive                | Meet opens share flow; nothing is selected automatically                                | No candidate hardware/browser control        |
| PRESENT-02 | `NOT RUN` | Cancel Chrome/macOS picker                       | No presentation starts; key returns inactive                                            | Picker requires an unlocked user UI          |
| PRESENT-03 | `NOT RUN` | Select and confirm a synthetic source            | Key becomes active only after Meet confirms                                             | No synthetic room/source and unlocked picker |
| PRESENT-04 | `NOT RUN` | Press key while locally presenting               | Only local user's presentation stops                                                    | No live presentation                         |
| PRESENT-05 | `NOT RUN` | Start and stop from Meet                         | Deck follows within one second                                                          | No synthetic room/browser control            |
| PRESENT-06 | `NOT RUN` | Exercise browser-blocked path                    | `needs_user_action`, single-tab focus, official shortcut, mandatory picker confirmation | Stable Chrome and picker unavailable         |
| PRESENT-07 | `NOT RUN` | Observe another synthetic participant presenting | Key never claims local sharing and cannot stop other presenter                          | No second synthetic participant/test room    |

### Lifecycle, faults, and language

| ID      | Result    | Live check                                       | Expected                                                                  | Actual / blocker                                                                                |
| ------- | --------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| LIFE-01 | `NOT RUN` | Reload joined Meet page                          | State and control recover after reauthentication                          | No synthetic test room/browser control                                                          |
| LIFE-02 | `NOT RUN` | Navigate within Meet SPA                         | Target/state remain correct without stale actions                         | No synthetic test room/browser control                                                          |
| LIFE-03 | `NOT RUN` | Close and reopen Meet tab                        | State clears and recovers safely                                          | No synthetic test room/browser control                                                          |
| LIFE-04 | `NOT RUN` | Reload extension                                 | Safe disconnect and authenticated recovery                                | Candidate extension not installed                                                               |
| LIFE-05 | `NOT RUN` | Disable and re-enable extension                  | Safe disconnect and authenticated recovery                                | Candidate extension not installed                                                               |
| LIFE-06 | `NOT RUN` | Suspend MV3 worker while bridge unavailable      | Fixed reconnect alarm wakes worker and retries loopback only              | Stable Chrome service-worker inspection unavailable                                             |
| LIFE-07 | `NOT RUN` | Quit and restart Chrome                          | Safe authenticated recovery                                               | Stable Chrome UI/control unavailable                                                            |
| LIFE-08 | `NOT RUN` | Quit and restart Stream Deck app                 | Safe authenticated recovery                                               | Mac UI locked; candidate package not installed                                                  |
| LIFE-09 | `NOT RUN` | Disconnect and reconnect Stream Deck USB         | Safe state loss and recovery                                              | Physical/user action not performed                                                              |
| LIFE-10 | `NOT RUN` | Change bridge port on both sides                 | Exact-port recovery only                                                  | Candidate UIs unavailable                                                                       |
| LIFE-11 | `NOT RUN` | Create a bridge port conflict                    | Clear safe error; no broadened listener                                   | Candidate UIs unavailable; live user runtime left untouched                                     |
| LIFE-12 | `NOT RUN` | Send invalid frame to live bridge                | Rejected with bounded resource use, no secret log, paired client recovers | No safe authenticated test client/live candidate session                                        |
| LIFE-13 | `NOT RUN` | Send oversized frame to live bridge              | Rejected with bounded resource use, no secret log, paired client recovers | No safe authenticated test client/live candidate session                                        |
| LIFE-14 | `NOT RUN` | Repeat full state/command matrix in English Meet | All applicable English cases pass                                         | No English synthetic test room/browser control                                                  |
| LIFE-15 | `NOT RUN` | Repeat full state/command matrix in German Meet  | All applicable German cases pass                                          | No German synthetic test room/browser control                                                   |
| LIFE-16 | `NOT RUN` | Exercise unsupported locale/layout               | `unsupported_ui`; never guess                                             | No controlled unsupported UI/browser control                                                    |
| LIFE-17 | `NOT RUN` | Observe every restart/reconnect handshake        | Reauthentication precedes every command                                   | No installed candidate session to observe                                                       |
| LIFE-18 | `PASS`    | Observe bridge bind address                      | No LAN listener; IPv4 loopback only                                       | Running plugin had one TCP listener at `127.0.0.1:53421`; its runtime JS hash matched candidate |

`LIFE-18` proves the bind address of the observed runtime code, not successful installation of the
candidate manifest/resources or any end-to-end command.

### Privacy and credential observation

| ID      | Result    | Live check                                               | Expected                                                                      | Actual / blocker                                                                  |
| ------- | --------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| PRIV-01 | `NOT RUN` | Capture candidate loopback WebSocket                     | Only documented finite fields; auth/MAC material redacted from evidence       | No live candidate pair or controlled capture                                      |
| PRIV-02 | `NOT RUN` | Replay a protected sequence against live peers           | Only valid protected envelopes accepted; replay fails                         | No safe authenticated live test client                                            |
| PRIV-03 | `NOT RUN` | Search candidate runtime logs for synthetic meeting data | No meeting URL/code/title, participant, chat, caption, or share-source name   | No synthetic live run; existing user logs deliberately not read                   |
| PRIV-04 | `NOT RUN` | Observe candidate runtime network traffic                | No Meet Deck endpoint other than loopback                                     | No live candidate capture; loopback listener/static policy alone is insufficient  |
| PRIV-05 | `NOT RUN` | Inspect live `chrome.alarms`                             | Fixed reconnect name/timing only, no payload, cleared when unnecessary        | Stable Chrome service-worker inspection unavailable                               |
| PRIV-06 | `NOT RUN` | Inspect live candidate credential lifecycle              | Credentials not exposed in UI/logs/evidence and erased by unpair              | Candidate not paired/installed in stable Chrome                                   |
| PRIV-07 | `PASS`    | Scan built payloads and this stored record               | No source maps, unexpected hosts, credential literals, or sensitive test data | Static artifact scans passed; report contains sanitized system/test metadata only |

## Defect found and corrected

`DOC-01` initially failed static compatibility review: the Stream Deck manifest declared macOS 13,
while the root and English/German setup documentation still said macOS 12. Commit
`9d7659bf7606f0977f242dd121d8287088a09bbe` aligns all three documents to macOS 13 and adds a
regression test that derives the minimum from the manifest. The focused test, full 183-test gate,
and final packaging all passed after the fix. There is no unresolved automated failure.

## Result summary and remaining blockers

Current checklist totals: **23 `PASS`, 0 `FAIL`, and 69 `NOT RUN`**. The corrected `DOC-01` defect
is recorded separately as an initial failure and is not an unresolved `FAIL`.

Release blockers:

1. Unlock the Mac and install/replace the exact packed Stream Deck candidate, then verify the
   installed payload and firmware in the real app.
2. Enable stable-Chrome automation (or perform the run interactively) and install the final
   extension ZIP in a clean test profile.
3. Provide a dedicated synthetic Meet room, English and German UI, a second synthetic participant,
   and the required picker/permission/USB clicks.
4. Run every `NOT RUN` row, capture only sanitized observations, and obtain zero failures before
   tagging.

No tag, version change, store submission, publication, push, or release action was performed.
