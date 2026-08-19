# Setup

## Requirements

- macOS 12 or newer
- Elgato Stream Deck desktop app 7.1 or newer
- Google Chrome 147 or newer
- A Stream Deck with LCD keys (Stream Deck + is supported through its keys)
- For source builds: Node.js 24.13.1 or newer within major version 24 and npm 11

Use artifacts from the same release. The Stream Deck plugin and Chrome extension share protocol
version 1; mixing unrelated development builds can leave them disconnected.

## Browser permissions

The extension requests `storage` for its local pairing token/configuration and `alarms` for a
durable MV3 reconnect wakeup. The fixed reconnect alarm contains only its name and schedule; it
stores or carries no meeting, control, or authentication data. Website access remains restricted to
the Meet content script on `https://meet.google.com/*`, with no `tabs`, cookies, microphone, camera,
or desktop-capture permission.

Access to the local plugin is a separate optional Chrome extension host permission. Only when the
user chooses **Pair and connect** or **Connect** does the popup request the exact configured
`ws://127.0.0.1:<configured port>` origin, using the Chrome match pattern
`ws://127.0.0.1:<configured port>/*`. Chrome completes the call without a prompt for an
already-granted matching origin. The permission covers neither LAN hosts, `localhost`, another
loopback address, nor all URLs; it has no wildcard scheme, host, or port.

## Install a release

1. Download `dev.annonator.meet-deck.streamDeckPlugin`, the matching `meet-deck-chrome-vX.Y.Z.zip`,
   and `SHA256SUMS.txt` from the GitHub release.
2. Verify both artifacts against `SHA256SUMS.txt`.
3. Double-click the `.streamDeckPlugin` file and accept installation in the Stream Deck app.
4. Until the extension is available from the Chrome Web Store, unzip the Chrome artifact, open
   `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the
   extracted directory containing `manifest.json`.
5. Add Meet Deck's microphone, camera, hand, and presentation actions to LCD keys in the Stream Deck
   app.

Developer-mode extensions do not update automatically. Replace the unpacked directory with every
release and press **Reload** on `chrome://extensions`.

## Pair the local bridge

1. Select any Meet Deck action in the Stream Deck app to open its property inspector.
2. Keep the default `127.0.0.1:53421` endpoint unless the port is already used. If it is changed,
   enter the same port in the extension popup.
3. Choose **Start pairing**. An eight-digit code is shown for two minutes.
4. Open the Meet Deck Chrome toolbar popup, enter the code, and choose **Pair and connect**. For a
   stored pairing, choose **Connect**. Either clear user gesture lets the extension request only the
   displayed configured loopback origin.
5. If Chrome asks, approve the exact host match pattern `ws://127.0.0.1:<configured port>/*`. Denial
   leaves Meet Deck offline without a remote fallback; an already-granted matching origin does not
   prompt again.
6. Confirm that both UI surfaces show **Connected**.

Pairing one Chrome profile replaces the prior profile. Reinstalling either side or clearing
extension storage requires pairing again. Never share a pairing code; it grants local control during
its short validity window.

Revoking the loopback host grant later stops new connections and reconnects. Choose **Pair and
connect** or **Connect** to request it again. Changing the bridge port changes the origin and
therefore requires host access for the new exact port; permission for one port is never treated as
permission for another. Saving a changed port disconnects a stored pairing but does not itself ask
for host access. After a successful change Meet Deck removes the superseded exact-port grant and
reports a cleanup failure so it can be revoked manually. Use **Connect** after changing the port to
grant and resume the saved pairing on the new origin.

## Use

Join one meeting at `https://meet.google.com/`. Pre-join/lobby pages do not count. Key icons reflect
confirmed Meet state and should update when controls are used either in Meet, through Meet's
keyboard shortcuts, or on the Stream Deck.

- **Microphone**, **Camera**, and **Hand** set the opposite of the confirmed current state.
- **Presentation** opens Meet's share flow. Select and confirm a source in the Chrome/OS picker.
  Meet Deck cannot and must not bypass this confirmation.
- Press **Presentation** again to stop the presentation owned by the local user.
- If Chrome blocks the start action, Meet Deck focuses the meeting and reports that user action is
  required. Use Google Meet's displayed presentation shortcut and complete the picker.

With no joined meeting, an unknown control layout, or more than one joined meeting, Meet Deck safely
performs no click.

## Build and install from source

```sh
npm ci
npm run check
npm run pack
```

The unpacked extension is built in `apps/chrome-extension/dist`, and its deterministic ZIP is
`artifacts/meet-deck-chrome-vX.Y.Z.zip`. The Stream Deck bundle root is
`apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin`; its packed artifact is
`artifacts/dev.annonator.meet-deck.streamDeckPlugin`. CI stages both files plus
`artifacts/SHA256SUMS.txt` under the root `artifacts/` directory.

For extension development, run:

```sh
npm run dev --workspace @meet-deck/chrome-extension
```

For plugin development, build once and link the bundle with the Elgato CLI, then use the workspace
watch script:

```sh
npx streamdeck link apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin
npm run watch --workspace @meet-deck/streamdeck-plugin
```

Unlink the development bundle before installing a packed release.

## Troubleshooting

- **Offline:** ensure the Stream Deck app is running, both sides use the same port, and no other
  process owns it. Choose **Pair and connect** or **Connect** and approve the exact
  `ws://127.0.0.1:<configured port>/*` host match pattern if it was denied or revoked. Re-pair
  rather than copying stored tokens.
- **No meeting:** finish joining the meeting. The pre-join preview is excluded.
- **Ambiguous meeting:** leave all but one joined Meet tab.
- **Unsupported UI:** reload Meet and check that Chrome/Meet is English or German. Do not repeatedly
  press the key; report the UI variant without including meeting names, codes, or participants.
- **Share does not start:** focus Meet, use the displayed Meet shortcut, and confirm the browser
  picker. This confirmation is a browser security feature.
- **State is stale after an update:** reload the unpacked extension and restart the Stream Deck app,
  then verify that both artifacts are from the same release.
