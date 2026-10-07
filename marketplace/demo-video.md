# Meet Deck functional demonstration video

## Status and deliverable

**Status:** physical capture required. Do not replace this with mock, generated, or Edge footage.

Final deliverable:

- path: `marketplace/assets/export/meet-deck-demo.mp4`;
- container: MP4;
- frame size: exactly 1920×1080;
- target: 30 fps, H.264 video, AAC audio if narration is used;
- file size: below 50,000,000 bytes to satisfy the smaller current Maker Console upload limit;
- duration target: 65–75 seconds.

Elgato publishes no required duration, frame rate, codec profile, narration, or caption format. The
targets above are reproducible compatibility choices. Elgato does require a functional demo for a
hardware-dependent product, so the video must show real Stream Deck input and real supported Google
Meet behavior.

## Capture preflight

1. Build the exact candidate with `npm run pack`. Install its `.streamDeckPlugin` artifact and load
   the matching companion extension in **Google Chrome**, not Microsoft Edge.
2. Use Stream Deck 7.1 or newer and a physical Stream Deck with LCD keys. Stream Deck + footage must
   show keys only; Meet Deck v0.2.0 does not support its dials or touch strip.
3. Pair before recording. Keep the pairing key and companion popup/onboarding out of frame. The
   Stream Deck property inspector and key labels are English.
4. Use an English-language Chrome profile and a dedicated Google Meet with synthetic identities and
   content. Use a neutral camera backdrop and a synthetic presentation window.
5. Hide the Meet URL/code, participant names and avatars, account identity, calendar titles,
   notifications, chat, captions, thumbnails, and unrelated windows.
6. Put Microphone, Camera, Hand, and Presentation on four visible LCD keys. Confirm the plugin and
   Chrome companion are connected before the take.

## Storyboard and shot list

| Time        | Picture and action                                                                                                                                                                                                                                       | On-screen caption                                        | Narration                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00:00–00:05 | Clean title card based on the listing thumbnail; no Marketplace badge                                                                                                                                                                                    | `Meet Deck` / `Google Meet controls on your Stream Deck` | “Meet Deck brings focused Google Meet controls to Stream Deck on macOS.”                                                                                      |
| 00:05–00:11 | Sanitized English Meet beside a camera view of the four real LCD keys                                                                                                                                                                                    | `Four controls · confirmed state`                        | “Four keys control your microphone, camera, raised hand, and your own presentation.”                                                                          |
| 00:11–00:22 | Finger presses Microphone off/on, then Camera off/on; Meet changes once and each key confirms the final state                                                                                                                                            | `Microphone + camera`                                    | “Press once to change a control, then see the state confirmed on the key.”                                                                                    |
| 00:22–00:30 | Finger presses Hand up/down; show the matching Meet change and key state                                                                                                                                                                                 | `Raise or lower your hand`                               | “Raise or lower your hand without hunting through the meeting controls.”                                                                                      |
| 00:30–00:46 | Finger presses Presentation. If the picker opens, continue. If the key briefly shows `⌃⌘T`, show Meet receiving focus, press `Control+Command+T`, and continue. In either path choose only a synthetic source, confirm Sharing, then press again to stop | `You always choose the share source`                     | “Presentation requests the protected share flow. If the key shows Control-Command-T, press that shortcut in Meet. You still choose and confirm every source.” |
| 00:46–00:54 | Change one visible Meet control with the mouse; show the corresponding key update without a key press                                                                                                                                                    | `Meet changes flow back to the key`                      | “Changes made in Meet flow back to the Stream Deck state.”                                                                                                    |
| 00:54–01:03 | Leave the test meeting or show the no-meeting state; press a key and show that no browser control activates                                                                                                                                              | `No supported meeting · no guessed click`                | “When there is no single supported meeting, Meet Deck fails closed instead of guessing.”                                                                      |
| 01:03–01:10 | End card with a simple `127.0.0.1` route and the four key icons                                                                                                                                                                                          | `Local pairing · no Meet Deck cloud relay`               | “The required Chrome companion pairs locally over an authenticated connection, with no Meet Deck backend or analytics.”                                       |

Use the caption column verbatim. If narration is omitted, hold each caption long enough to read and
preserve the same claim boundaries.

## Recording procedure

Use two synchronized recordings so every browser result can be tied to a visible physical press.

1. Mount a phone or camera in landscape above the Stream Deck. Frame only the four LCD keys and the
   operator's finger. Record 1080p at 30 fps using fixed focus/exposure where possible.
2. Record the Mac screen at native resolution. On the current development Mac, the built-in capture
   command is:

   ```sh
   mkdir -p /tmp/meet-deck-demo
   /usr/sbin/screencapture -v -D 1 -k -g -V 90 /tmp/meet-deck-demo/screen.mov
   ```

3. At the start of both recordings, press a harmless key once or clap in view to create a sync
   point. Perform the storyboard in one continuous privacy-safe take.
4. Stop early if any real identifier, notification, meeting code, or unrelated window appears.
   Sanitize the environment and retake; do not rely on a blur to hide avoidable sensitive data.
5. Review the raw screen recording and physical-device recording independently before editing.

## Edit and export in iMovie

1. Create a new Movie project. Add the screen recording first so the project resolution is 1080p.
2. Trim to the shot list. Add the physical-device recording above the screen clip and choose
   **Picture in Picture**. Keep the keys large enough that state changes are readable.
3. Align the initial sync point, then mute camera audio. Add the exact English captions above and,
   optionally, the narration. Use no copyrighted music, Google/Elgato logo animation, Marketplace
   availability badge, or “official” language.
4. Export a high-quality 1080p H.264 master to `/tmp/meet-deck-demo/master.mov`.
5. Normalize to an MP4 if necessary:

   ```sh
   /usr/bin/avconvert \
     --source /tmp/meet-deck-demo/master.mov \
     --preset Preset1920x1080 \
     --output /tmp/meet-deck-demo/meet-deck-demo.mp4 \
     --replace \
     --progress
   ```

6. Inspect the export:

   ```sh
   /usr/bin/avmediainfo /tmp/meet-deck-demo/meet-deck-demo.mp4 --brief
   /usr/bin/mdls \
     -name kMDItemPixelWidth \
     -name kMDItemPixelHeight \
     -name kMDItemCodecs \
     -name kMDItemDurationSeconds \
     -name kMDItemFSSize \
     /tmp/meet-deck-demo/meet-deck-demo.mp4
   test "$(stat -f %z /tmp/meet-deck-demo/meet-deck-demo.mp4)" -lt 50000000
   ```

7. Copy the reviewed file to `marketplace/assets/export/meet-deck-demo.mp4`, change
   `media.demoVideo.status` in `listing.json` from `capture-required` to `ready`, and run:

   ```sh
   npm run validate:listing-assets
   ```

The validator intentionally fails if a video is present while the status still says
`capture-required`, or if the status says `ready` and no valid 1920×1080 MP4 is present.
