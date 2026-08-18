# Hardware end-to-end acceptance

Run this checklist before every public release. It verifies the real Stream Deck, Stream Deck app,
Chrome security UI, Meet DOM, loopback bridge, and MV3 lifecycle; unit tests alone cannot cover
those boundaries.

## Test record

Record without meeting-sensitive data:

- candidate tag and commit;
- SHA-256 of both artifacts;
- Mac model and macOS version;
- Stream Deck model/firmware and desktop-app version;
- Chrome version and extension installation type (unpacked/store);
- Meet UI language (`en` or `de`), date, tester, result, and sanitized notes.

Use a dedicated test meeting with synthetic identities. Screenshots and logs must not contain real
meeting codes, URLs, calendar titles, participant names, chat, captions, thumbnails, or shared
content.

## Clean setup and pairing

1. Remove or unpair any prior Meet Deck installation. Install both artifacts from the candidate
   release and verify their checksums.
2. Add all four actions to LCD keys. Confirm unpaired/offline states are visible and pressing keys
   causes no browser action.
3. Open pairing. Verify the code has exactly eight digits, expires after two minutes, and is
   rejected after expiry.
4. Submit five wrong codes. Verify pairing closes/rate-limits and only an explicit new pairing
   window restores it.
5. Pair correctly and approve Chrome LNA. Confirm Connected on both sides.
6. Unpair, deny LNA, and verify the extension remains offline without contacting a remote endpoint.
   Re-enable/approve LNA and pair again.

## Meeting targeting

1. With no Meet tab, press every key: no action and a clear no-meeting state.
2. On a pre-join page, repeat: it must not be treated as joined.
3. Join one test meeting and confirm all four keys reach a known state within one second.
4. Join a second meeting in another tab/profile window. Every command must be blocked as ambiguous,
   with no click in either meeting.
5. Leave the second meeting. The first meeting must become controllable again without re-pairing.

## State and command matrix

For microphone, camera, and hand, test both directions using each input source:

| Action source                   | Expected result                                               |
| ------------------------------- | ------------------------------------------------------------- |
| Stream Deck key                 | Meet changes once; key confirms final state within one second |
| Visible Meet control            | Every corresponding Deck key updates within one second        |
| Official Meet keyboard shortcut | Every corresponding Deck key updates within one second        |

Hold or rapidly press each Deck key. Confirm command/result correlation prevents oscillation,
double-clicking, and a false final icon. Duplicate instances of the same action on different
pages/profiles must always show the same confirmed state.

Disable a control through meeting policy/permissions where possible. The key must show
blocked/unknown and must not try a different element.

## Presentation matrix

1. Press Presentation while inactive. Confirm Meet opens its share flow but no screen/window/tab is
   selected automatically.
2. Cancel the Chrome/macOS picker. Confirm no presentation starts and the Deck returns to inactive.
3. Repeat, choose a synthetic source, and confirm it. The key becomes active only after Meet
   confirms sharing.
4. Press the key while active. Confirm only the local user's presentation stops.
5. Start/stop from Meet itself and verify Deck state follows within one second.
6. Exercise the browser-blocked path. Confirm `needs_user_action`, focus of the single Meet tab, the
   displayed official shortcut, and mandatory picker confirmation.
7. While another participant presents, confirm the key does not claim the local user is sharing and
   cannot stop the other participant's presentation.

## Lifecycle and fault tests

- Reload the Meet page; navigate within Meet's SPA; close/reopen the tab.
- Reload/disable/enable the extension and allow its MV3 worker to suspend. With the bridge
  unavailable, verify the fixed reconnect alarm wakes the worker and only retries loopback.
- Quit/restart Chrome, then quit/restart the Stream Deck app.
- Disconnect/reconnect the Stream Deck USB cable.
- Change the bridge port on both sides and test a port-conflict error.
- Send an invalid/oversized local frame with a test client; verify rejection, bounded resource use,
  no secret logging, and recovery for the paired client.
- Replace English with German Meet and repeat the state/command matrix. An unsupported locale/layout
  must fail as `unsupported_ui`, never guess.

After every restart/reconnect, authentication must run again automatically; no command is accepted
before it succeeds. Confirm reconnection does not create a LAN listener (`127.0.0.1` only).

## Privacy observation

Capture the loopback WebSocket in a controlled test build. Verify that messages contain only
protocol version/type, opaque IDs/nonces/session, direction and sequence, finite control states,
meeting multiplicity, result codes, and authentication/MAC material. Authentication and MAC material
must be redacted from stored evidence. Verify that post-authentication application messages are
accepted only inside valid protected envelopes and that replayed sequences fail.

Search plugin and extension logs for the synthetic meeting URL/code, title, participant, chat,
captions, and share-source name. None may appear. Confirm no outbound endpoint is contacted by Meet
Deck other than the local loopback bridge; Google Meet's own traffic is not attributable to the
extension.

Inspect `chrome.alarms`: only the fixed Meet Deck reconnect name and timing may exist. It must carry
no meeting/control/authentication payload and must clear after reconnection or when no reconnect is
needed.

## Release acceptance

A candidate passes only when all applicable cases pass on both English and German Meet, no
privacy/security invariant is violated, and every observed failure is safe and understandable.
Attach the sanitized record to the release process. Do not waive failures in pairing, target
ambiguity, screen-share consent, state correctness, or data minimisation.
