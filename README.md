# Meet Deck

Meet Deck is a privacy-first, open-source Stream Deck plugin for controlling Google Meet from a
Stream Deck. It pairs with a narrowly scoped Chrome extension and keeps all communication on
`127.0.0.1`.

> **Early beta:** Google Meet has no public API for these controls. The DOM adapter therefore needs
> maintenance when Google changes Meet's UI. Unknown or ambiguous controls fail closed instead of
> clicking blindly.

[Deutsche Dokumentation](docs/de/setup.md) · [English documentation](docs/en/setup.md)

## Controls

- Mute or unmute the microphone, with confirmed live state on the key.
- Turn the camera on or off, with confirmed live state.
- Raise or lower your hand.
- Stop your own active screen share.
- Start the Meet presentation flow when Chrome permits it.

Starting a screen share always requires a person to choose and confirm a source in Chrome's picker.
Browsers intentionally do not allow an extension to remember or silently select a screen. A Stream
Deck press also may not count as browser “user activation”; in that case Meet Deck reports that user
action is needed and the documented Meet hotkey (`Control+Command+T` on macOS) is the reliable
fallback.

## Privacy and security

The extension can run only on `https://meet.google.com/*`. It does not request access to other sites
and has no backend, analytics, OAuth, or remote code. The local protocol carries only finite control
commands and coarse state such as microphone on/off. It never carries meeting URLs or codes, titles,
participant names, chat, captions, audio, video, or screen content.

The bridge binds only to IPv4 loopback, uses an explicit short-lived pairing flow, mutual HMAC
authentication, direction-separated session keys, authenticated messages, and replay protection.
These measures protect against ordinary websites and unpaired extensions. Like any same-user local
integration, it cannot protect against malware that already controls the macOS account or can read
the Chrome profile or Stream Deck settings.

See the complete [security model](docs/en/security.md), [privacy disclosure](docs/en/privacy.md),
and [architecture](docs/en/architecture.md).

## Build from source

Building requires Node.js 24.13.1 and npm and is tested in CI on Ubuntu 24.04. Running and manually
testing version 1 requires macOS 12+, Chrome 147+, and Stream Deck 7.1+.

```sh
npm ci
npm run check
npm run pack
```

Installable artifacts are written to `artifacts/`:

- `dev.annonator.meet-deck.streamDeckPlugin`
- `meet-deck-chrome-vX.Y.Z.zip`
- `SHA256SUMS.txt`

For development, load `apps/chrome-extension/dist/` as an unpacked extension in Chrome. Install the
`.streamDeckPlugin` file with Stream Deck, add a Meet Deck action to a key, open its property
inspector, start pairing, then enter the displayed eight-digit code in the extension popup.

Detailed instructions are in [Setup](docs/en/setup.md). Hardware acceptance steps are in
[Hardware E2E](docs/en/hardware-e2e.md).

## Repository layout

```text
apps/chrome-extension/   Chrome MV3 extension and Meet DOM adapter
apps/streamdeck-plugin/  Stream Deck plugin and local WebSocket server
packages/protocol/       Strict wire schemas and canonical crypto inputs
docs/                    English and German operating documentation
```

## License

MIT © annonator. Google Meet, Chrome, Stream Deck, Elgato, and their marks belong to their
respective owners. This project is not affiliated with Google or Elgato.
