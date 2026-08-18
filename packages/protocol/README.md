# `@meet-deck/protocol`

Dependency-free TypeScript types and strict runtime validation for the local Meet Deck WebSocket
protocol. The package is browser-compatible and uses no Node.js-only APIs.

## Transport model

Pairing exchanges an eight-digit code for a random 256-bit token. Authentication then binds a client
nonce, server nonce, pinned Chrome extension origin, fixed client/server roles, and a random
connection-session id into mutual HMAC proofs. The package exposes canonical UTF-8 inputs for those
proofs and for deriving two direction-separated HKDF-SHA-256 session keys.

For HKDF-SHA-256, decode the pairing token from base64url and use those 32 bytes as IKM, use
`encodeSessionKeySalt(binding)` directly as salt, and call
`encodeSessionKeyInfo(binding, direction)` separately for each direction.

After authentication, every command, state, result, ping, and pong is nested in a `ProtectedMessage`
containing the connection session, direction, monotonically increasing sequence number, and HMAC.
Raw application messages are rejected as wire frames. Verify the HMAC before passing a frame to
`ProtectedMessageReplayGuard.acceptAuthenticated`.

```ts
import {
  encodeProtectedMessageMacInput,
  parseProtocolMessage,
  type ProtectedMacInput,
  type ProtectedMessage
} from "@meet-deck/protocol";
```

Cryptographic operations, random generation, token storage, constant-time MAC comparison,
connection-origin checks, rate limiting, and secret erasure remain the responsibility of the two
endpoints. The protocol package only supplies wire types, canonical inputs, strict validators,
frame-size enforcement, and a post-verification replay guard.

## Privacy boundary

Message objects are closed and unknown fields are rejected. State contains only
`meetingMultiplicity`, microphone/camera/hand state, and `selfPresentation`. Meeting URLs, codes,
titles, participants, chat, captions, and media have no protocol field. `session` is a freshly
generated 256-bit, unpadded-base64url identifier and must never be derived from Meet data.

`parseProtocolMessage` accepts string, `Uint8Array`, or `ArrayBuffer`, enforces a 16 KiB UTF-8
limit, parses JSON, and validates protocol v1. Its safe variant returns a discriminated result;
category-specific type guards are also exported.
