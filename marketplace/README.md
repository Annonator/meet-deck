# Meet Deck Marketplace listing kit

This directory contains the review-ready English copy and media for a future Meet Deck submission.
It does not indicate that Meet Deck is available on Marketplace, and nothing in this kit submits,
publishes, tags, or changes the product version.

[`listing.json`](listing.json) is the canonical copy and media manifest. The generated PNG files in
[`assets/export`](assets/export) are listing-only assets; they do not replace or modify any Stream
Deck runtime, category, or action icon.

## Final product copy

- **Product name:** Meet Deck
- **Tagline for media/optional marketing:** Google Meet controls on your Stream Deck.
- **Listing language:** English
- **Runtime UI:** Stream Deck property inspector in English; Chrome companion setup in German;
  supported Google Meet controls in English or German
- **Recommended price:** Free; the Maker must confirm this before creating the product because the
  monetization choice cannot be changed in Maker Console without contacting Elgato.

Elgato does not currently document a separate tagline field or limit. The tagline above is for the
thumbnail and any optional marketing surface, not a claimed Maker Console field.

### Description

Meet Deck adds focused Google Meet controls to Stream Deck on macOS. Toggle your microphone or
camera, raise or lower your hand, and request Meet's presentation flow or stop your own active
presentation while each key follows the confirmed meeting state. A required Chrome extension pairs
with the plugin over an authenticated local connection on 127.0.0.1; Meet Deck has no backend,
analytics, or cloud relay.

Use it with macOS 12 or newer, Stream Deck 7.1 or newer, Chrome 147 or newer, a Stream Deck with LCD
keys, and Google Meet controls in English or German. Install the matching companion extension, add
the actions, then pair once with a short-lived code. Stream Deck settings are English; the companion
setup screen is currently German. Chrome still requires you to choose and confirm every screen-share
source. If browser user action is needed, the Presentation key briefly shows `⌃⌘T`; press
`Control+Command+T` in Meet to continue.

- Microphone and camera toggles with live state
- Raise and lower hand
- Presentation requests and stop control
- Safe no-click behavior when no single supported meeting is available
- Open source under the MIT License

### Feature bullets

- Toggle the microphone or camera with confirmed live state on each key.
- Raise or lower your hand from a Stream Deck key.
- Request Meet's presentation flow or stop your own active presentation; if the key briefly shows
  `⌃⌘T`, press `Control+Command+T` in Meet to continue.
- Pair the plugin and required Chrome companion through an authenticated local connection on
  `127.0.0.1`.
- Fail closed when there is no joined meeting, more than one joined meeting, or an unsupported
  control layout.
- Use open-source software with no Meet Deck backend, analytics, advertising, or cloud relay.

### Setup instructions

1. Install the Meet Deck plugin from its product page once manually published, or use the submitted
   plugin artifact during review.
2. Follow the Setup link to install the matching Meet Deck companion extension in Google Chrome.
3. Add the Microphone, Camera, Hand, and Presentation actions to Stream Deck LCD keys.
4. Select any Meet Deck action, choose **Start pairing**, and enter the displayed eight-digit code
   in the German companion screen within two minutes. Choose **Sicher verbinden**.
5. Approve Chrome Local Network Access if prompted, then confirm the extension shows **Sicher mit
   Stream Deck verbunden** and the property inspector shows **Extension connected**.
6. Join exactly one supported Google Meet and use the keys. For presentation, if the key briefly
   shows `⌃⌘T`, press `Control+Command+T` in Meet, then choose and confirm the source in Chrome or
   macOS.

### Additional links

- **Repository:** <https://github.com/Annonator/meet-deck>
- **Support:** <https://github.com/Annonator/meet-deck/issues>
- **Setup:** <https://github.com/Annonator/meet-deck/blob/main/docs/en/setup.md>
- **Privacy:** <https://github.com/Annonator/meet-deck/blob/main/docs/en/privacy.md>

### Reviewer instructions

1. Use a Mac running macOS 12 or newer, Stream Deck 7.1 or newer, Google Chrome 147 or newer, and a
   physical Stream Deck with LCD keys.
2. Install the submitted `.streamDeckPlugin` artifact. Extract the matching v0.1.0 companion from
   the Maker-provided review ZIP, then load the extracted directory containing `manifest.json` as an
   unpacked Chrome extension. This draft does not claim Chrome Web Store availability.
3. Add all four actions to LCD keys. Select one, open its property inspector, start pairing, and
   enter the eight-digit code in the German companion screen before its two-minute expiry. Choose
   **Sicher verbinden** and approve Chrome Local Network Access if prompted. Confirm **Sicher mit
   Stream Deck verbunden** in the extension and **Extension connected** in the property inspector.
4. Join a dedicated Google Meet containing only synthetic identities and content. Test microphone,
   camera, and hand in both directions: press the physical key, then change the visible Meet control
   and confirm the key follows the final state.
5. Press Presentation while inactive. If the share flow opens, verify that Chrome or macOS requires
   source selection. If the Presentation key briefly shows `⌃⌘T`, verify Meet is focused, press
   `Control+Command+T`, and continue. In either path, confirm that no source is selected
   automatically, choose a synthetic source, confirm the **Sharing** key state, then press again to
   stop your own presentation.
6. Leave the meeting and press each key; no browser control should activate. Join a second test
   meeting in another tab and verify commands remain blocked as ambiguous.
7. Never include real meeting URLs, codes, titles, participant names, chat, captions, thumbnails,
   audio, video, or shared content in review evidence.

### v0.1.0 release notes

Initial release of Meet Deck. Adds four Stream Deck key actions for microphone, camera, raised hand,
and the local user's presentation, with confirmed Google Meet state feedback. If browser user action
is needed, the Presentation key briefly shows `⌃⌘T`; press `Control+Command+T` in Meet to continue.
Source selection remains in Chrome and macOS. Includes short-lived local pairing with the required
Chrome companion, authenticated commands on `127.0.0.1`, and safe no-click behavior when no single
supported meeting is available. Supports macOS 12+, Stream Deck 7.1+, Chrome 147+, and English or
German Google Meet controls. The Stream Deck settings are English and the companion setup screen is
German.

## Media inventory

Upload gallery items in this order. Maker Console does not currently support reordering; removing
and re-adding items is required to change the order.

| Order     | Asset                                             | Purpose                                                  |
| --------- | ------------------------------------------------- | -------------------------------------------------------- |
| Icon      | `assets/export/meet-deck-app-icon.png`            | Separate 288×288 Marketplace app icon                    |
| Thumbnail | `assets/export/meet-deck-thumbnail.png`           | 1920×960 listing thumbnail                               |
| 1         | `assets/export/meet-deck-gallery-01-controls.png` | Four actions and confirmed key state                     |
| 2         | `assets/export/meet-deck-gallery-02-pairing.png`  | Accurate local pairing flow diagram                      |
| 3         | `assets/export/meet-deck-gallery-03-privacy.png`  | Authenticated loopback and data boundary                 |
| 4         | `assets/export/meet-deck-demo.mp4`                | Required honest hardware demonstration; still to capture |

The pairing graphic deliberately labels its eight-digit code as illustrative. It does not depict a
translated extension screenshot: the current Chrome companion popup is German, and Elgato requires
English submission media.

The editable source for all PNGs is [`assets/source/artboards.html`](assets/source/artboards.html).
To regenerate and verify the exports, install `playwright-cli`, then run:

```sh
npm run render:listing-assets
npm run validate:listing-assets
```

## Demonstration video status

The MP4 is intentionally absent. The installed hardware and software can support a real capture, but
an honest demonstration still requires a person to press and film the physical Stream Deck while a
sanitized meeting runs in supported Google Chrome. Microsoft Edge footage, DOM fixtures, mock
controls, or generated animation would not prove the supported product works.

The complete storyboard, captions, narration, privacy checklist, capture procedure, export command,
and validation steps are in [`demo-video.md`](demo-video.md).

## Current Elgato requirements

The requirements were checked against live official documentation on 2026-08-19:

- app icon: static PNG, exactly 288×288;
- thumbnail: PNG, exactly 1920×960;
- gallery: 3–10 items; image items are PNG 1920×960 and video items are MP4 1920×1080;
- all name, description, release-note, and media text is English;
- description: 250–1,500 characters, with the first 250 characters unformatted;
- hardware-dependent products require a functional demonstration video;
- release notes and additional support/resource links are required.

The written media guideline and current Maker Console screenshots disagree on some upload limits.
This kit uses their strict intersection: PNG rather than JPEG, exact dimensions, app icon at most 2
MB, thumbnail at most 5 MB, gallery image at most 10 MB, and demo MP4 below 50 MB. The written
gallery-video guideline allows up to 250 MB, but the smaller current upload-UI limit is safer.

Official references:

- [Product Guidelines](https://docs.elgato.com/guidelines/products/)
- [Branding Guidelines](https://docs.elgato.com/guidelines/branding/)
- [Stream Deck Plugin Guidelines](https://docs.elgato.com/guidelines/stream-deck/plugins/)
- [Submitting Products](https://docs.elgato.com/maker-console/submitting-products/)
- [Review Process](https://docs.elgato.com/maker-console/review-process/)
- [Managing Products](https://docs.elgato.com/maker-console/managing-products/)

## Remaining Maker Console work

1. Run the full hardware acceptance checklist with the exact candidate plugin and companion
   artifacts in Google Chrome, then capture the required MP4 from [`demo-video.md`](demo-video.md).
2. Immediately before creating the product, search the live Marketplace and Maker Console to confirm
   that **Meet Deck** is still unique. Then confirm the `annonator` Maker organization, support
   method, Maker Agreement, and Free monetization choice; the name and monetization choice are not
   self-service editable after creation.
3. Build the exact candidate artifacts with `npm run pack`. Before submission, confirm with
   `maker@elgato.com` how to deliver the matching companion ZIP to reviewers, then record the agreed
   channel and ZIP SHA-256 without claiming Chrome Web Store availability.
4. Create the Stream Deck plugin product and upload the `.streamDeckPlugin`, icon, thumbnail, three
   PNG gallery images, and functional MP4. Add the links and final copy above.
5. Turn off **Automatically publish after being approved**, submit for review, and allow Elgato's
   stated 4–10 business-day review window.
6. After approval, verify that the companion-extension distribution path is ready, perform a clean
   install test, and only then release the approved listing manually.
