# Security and threat boundaries

## Security goals

Meet Deck is designed to make a narrow set of meeting-control actions auditable without exposing
meeting information to a third party. The key properties are:

- all control traffic remains on the local machine;
- only an explicitly paired Chrome extension can issue/receive bridge messages;
- the extension can act only on an unambiguous, joined Google Meet;
- every wire message is strictly bounded and validated before use;
- screen-capture consent remains with Chrome/macOS and the user;
- failure is visible and produces no guessed click.

## Trust boundaries

1. **Stream Deck hardware and desktop app.** Elgato owns device input and plugin lifecycle. Meet
   Deck trusts the SDK event identity but not arbitrary settings payloads; settings remain
   validated.
2. **Plugin process.** It stores the paired secret and exposes a WebSocket only on `127.0.0.1`.
   Other local processes are potentially hostile.
3. **Loopback transport.** Loopback limits network reach but is not an authentication mechanism.
   Browser pages and local malware may attempt a connection, replay, or resource-exhaustion attack.
4. **Chrome extension service worker.** It stores the token, authenticates the bridge, and routes
   only protocol messages. MV3 suspension/restart is expected. A fixed-name Chrome alarm can wake it
   to retry the local bridge; that alarm carries only scheduling metadata and no meeting, control,
   or authentication payload.
5. **Meet content script and DOM.** Meet is remote, frequently changing input. Labels, attributes,
   messages, and element counts are untrusted until they match a narrow supported state machine.
6. **Browser/OS share picker.** This is outside Meet Deck's control and is the authority for source
   selection and capture consent.

Compromise of the local user account, Chrome profile, Stream Deck app, or host operating system is
outside the protection boundary. Meet Deck does not claim to protect against malware already able to
inspect those processes or input.

## Threats and controls

| Threat                                      | Required control                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Remote/LAN client reaches bridge            | Bind only IPv4 `127.0.0.1`; reject unexpected upgrade `Host`; never use `localhost`, wildcard, IPv6, LAN, or cloud relay |
| Arbitrary website opens loopback WebSocket  | Pairing closed by default; pin the exact paired `chrome-extension://` origin; authenticate before commands               |
| Pairing-code guessing                       | Eight digits, two-minute expiry, maximum five failures, explicit reopen required                                         |
| Stolen/replayed connection proof            | Random 256-bit token; fresh client/server nonces; session/origin/role-bound mutual HMAC-SHA-256 proofs                   |
| Malformed or oversized frame                | UTF-8/JSON/schema validation, exact keys, protocol `v: 1`, 16 KiB maximum, close invalid peers                           |
| Command replay/confusion                    | MAC every protected frame; session/direction binding; strictly increasing per-direction sequence; reject unknown actions |
| Accidental control of another meeting       | Require `meetingMultiplicity: one`; block on `none` or `multiple`; never use URL/title as routing data                   |
| Meet DOM drift causes wrong click           | Exact supported roles/accessibility state, one match and revalidation before click; `unsupported_ui` on doubt            |
| Secret or meeting metadata leaks in logs    | Never log code/token/HMAC/MAC, payload dumps, accessibility labels, or meeting-derived text; use finite reason codes     |
| Share starts without informed source choice | Delegate final selection to the mandatory Chrome/macOS picker; no `desktopCapture` permission                            |
| MV3 reconnect bypasses auth                 | Authenticate every new WebSocket before accepting state or commands                                                      |

Pairing replaces the prior Chrome profile. Authentication binds both 256-bit nonces, the random
session, exact Chrome-extension origin, and the extension/plugin roles. The server proof also lets
the extension authenticate the plugin. Comparison of authentication values must avoid early-exit
timing differences where the runtime provides a safe constant-time primitive. Secrets are generated
with cryptographically secure randomness and are never accepted from URL/query parameters.

The plugin stores its token only in Stream Deck **global settings**, never action settings that can
be exported with a profile. The property inspector exchanges typed control messages with the plugin
and never reads the token. Chrome stores the token only in `chrome.storage.local`, immediately
restricted to `TRUSTED_CONTEXTS`; it is never synced and is not readable by the content script.

The content script is treated as an untrusted boundary, not as an authority. The service worker
validates `sender.id`, main-frame status, the exact Meet origin, and the browser-supplied tab and
document identities. It never trusts a tab/document ID from a payload. Messages contain only closed
command/state unions—never selectors, JavaScript, URLs, arbitrary text, or accessibility labels.

## Protocol invariants

The shared `@meet-deck/protocol` package is the only wire parser and source of canonical
authentication/frame inputs. Unknown fields are rejected, not ignored. Top-level pre-authentication
frames are limited to pairing and authentication. After authentication, the only accepted top-level
frame is `protected`, whose application message is command, state, result, or ping/pong.

Every protected frame binds `session`, `direction`, a sequence starting at one, the exact
application message, and a MAC. The sequence strictly increases for each session/direction. Commands
flow plugin-to-extension; state and results flow extension-to-plugin. A state carries only meeting
multiplicity and finite microphone, camera, hand, and self-presentation values. Meeting-derived free
text is not part of the schema.

No state or command is processed until mutual authentication succeeds. Rate limits and bounded
queues apply per connection; disconnect clears unauthenticated and in-flight transient state.

The socket accepts UTF-8 text only, disables WebSocket compression, enforces the 16 KiB limit before
parsing, applies an authentication timeout, and bounds unauthenticated and authenticated
connections. Commands are idempotent `.set` operations, with at most one in-flight operation per
control. The content script revalidates that the sole matching element remains visible, connected,
enabled, and semantically exact immediately before clicking; success requires observed state.

## Optional Chrome loopback host permission

[Chrome 147](https://developer.chrome.com/release-notes/147) can gate a loopback WebSocket behind
explicit access. Meet Deck declares only an optional Chrome extension host capability for
`127.0.0.1`; it does not receive that access at installation. An explicit **Pair and connect** or
**Connect** click calls Chrome's permission request directly for the exact configured
`ws://127.0.0.1:<configured port>` origin, expressed as the match pattern
`ws://127.0.0.1:<configured port>/*`, preserving the user gesture. The required `/*` is Chrome
match-pattern syntax; the request has no wildcard scheme, host, or port. Chrome completes that call
without another prompt if the exact origin is already granted. The extension CSP independently
remains limited to `ws://127.0.0.1:*`, while the WebSocket transport uses `/v1`. This is an
extension host grant, not a website permission or website-settings prompt.

An already-granted matching origin connects without another prompt. Denial and enterprise-policy
blocking keep the attempted connection offline. Later revocation blocks the next connection or
reconnect; an already-open WebSocket is not assumed to close immediately. These are stable states,
not retry storms. A port change is a different origin and requires a grant for that exact new port;
after saving it, Meet Deck removes the superseded exact-port grant and surfaces cleanup failure.
Meet Deck never expands the request to LAN addresses, `localhost`, other loopback names/addresses, a
wildcard scheme/host/port, or all URLs, and it must not work around a denial with a public proxy,
DNS rebinding, native messaging, or a remote fallback.

## Required security tests

- prove that LAN, wildcard/IPv6, unexpected Host, DNS-rebinding Host, missing/null/duplicate Origin,
  websites, and another extension cannot use the bridge;
- cover code expiry, five failures, a race between two valid pairing clients, one-time use, and
  re-pair invalidation of the old token/session;
- reject wrong-key or modified origin/nonce/role proofs, tampered MACs, duplicate/old sequences,
  stale sessions, binary/invalid UTF-8, extra fields, and 16 KiB + 1 payloads;
- reject content-script subframes, stale document identities, false sender data, and token access;
- test hidden, disabled, duplicate, near-label, and lookup-to-click-mutated controls with zero
  clicks;
- verify optional exact-loopback permission already-granted/allow/deny/revoke/port-change/enterprise
  block paths plus MV3 worker and plugin restart, and prove no LAN or all-URL grant is requested;
- verify the reconnect alarm has only its fixed name/timing, wakes only for a loopback retry, and
  clears when no longer needed;
- inspect traffic, Chrome storage, Stream Deck global/action settings, exported profiles, and logs
  for forbidden meeting metadata, accessibility labels, pairing codes, and tokens.

## Vulnerability reporting

Use the repository's private security-reporting channel when available. Include the affected
version, operating system, Chrome and Stream Deck versions, reproduction steps, and impact. Redact
all meeting codes, URLs, account details, participants, chat, captions, and media. Do not test
against another person's meeting or publish an active pairing token.

Security fixes should add a regression test and disclose only after a patched release is available.
