# Chrome Web Store media

This directory contains the source and checked output for Meet Deck's Chrome Web Store listing.
Store-only files live outside `public/`, so they are not copied into the extension ZIP.

## Assets

| File                               | Size     | Truthful fixture                                                     |
| ---------------------------------- | -------- | -------------------------------------------------------------------- |
| `assets/small-promo-440x280.png`   | 440×280  | Brand-only small promotional tile                                    |
| `assets/01-pair-locally.png`       | 1280×800 | Built English popup, unpaired, with a clearly labelled example code  |
| `assets/02-connected-controls.png` | 1280×800 | Built English connected popup and real checked-in plugin key artwork |
| `assets/03-private-by-design.png`  | 1280×800 | Built English onboarding privacy card and its exact localized copy   |

The meeting and key states are fixed synthetic fixtures. The generator never opens Google Meet and
does not use a meeting URL, title, participant, chat, caption, media, or screen content.

## Regenerate

Use the repository's pinned Node and npm versions and a locally installed Chrome or Chromium:

```sh
npm ci
npm run store:generate
npm run store:validate
```

Set `CHROME_EXECUTABLE` if Chrome is not installed in a standard macOS or Linux location. The
generator builds and loads the real compiled popup/onboarding pages, installs only an in-page
`chrome` API fixture, asserts the expected visible/hidden state, and renders at device scale 1.
Inputs, locale, timezone, viewport, status, pairing code, and action states are fixed. Chrome's
rasterizer can still produce byte-level differences across browser/platform versions, so review the
rendered output after regeneration.

Edit `source/store-assets.css`, `listing.json`, or the generator rather than hand-editing PNGs. The
validator checks PNG structure/CRC/dimensions, the 128×128 store icon's 96×96 safe area, listing
field limits and manifest alignment, and that listing media stays out of `dist/`.
