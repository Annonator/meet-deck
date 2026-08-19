# Chrome Web Store submission sheet

Prepared against the current official Chrome Web Store documentation on 2026-08-19. The canonical
paste-ready English fields, permission explanations, privacy answers, reviewer procedure, and media
paths are in [`listing.json`](listing.json).

## Store listing

- Name: **Meet Deck**
- Summary: **Privacy-first local Google Meet controls for Stream Deck.**
- Category: **Communication**
- Default language: **English (`en`)**
- Homepage: <https://github.com/Annonator/meet-deck>
- Support: <https://github.com/Annonator/meet-deck/issues>
- Privacy policy: <https://github.com/Annonator/meet-deck/blob/main/docs/en/privacy.md>
- Official URL: leave unset until the publisher owns a Search Console-verified site offered by the
  dashboard.
- Mature content: **No**

Upload `assets/small-promo-440x280.png`, all three ordered screenshots in `assets/`, and use the
128×128 PNG already packaged as `icons/icon-128.png`. The promo is brand-led because promotional
images are global rather than locale-specific. The screenshots use full-bleed 1280×800 canvases and
current built UI.

## Privacy practices

Paste `privacy.singlePurpose` and each entry in `permissionJustifications` verbatim. Declare that
the extension does **not** use remote code.

Select only these handled-data categories:

- **Website content** — transient supported Meet control labels/state used for the disclosed control
  function.
- **Authentication information** — the separate random local Meet Deck pairing credential, not a
  Google/account credential.

Do not select personally identifiable information, health information, financial/payment
information, personal communications, location, web history, or user activity. Affirm all three
Limited Use certifications captured in `listing.json`. Local-only processing still counts as data
handling; do not claim that the extension handles no data.

## Reviewer instructions

Before pasting `reviewer.additionalInstructionsTemplate`, publish the exact matching
`.streamDeckPlugin` release artifact at a stable public URL and replace `{COMPANION_PLUGIN_URL}`.
Use the full procedure as the internal review checklist. No test account or credentials are needed;
the hardware, Stream Deck app, matching plugin, and one synthetic Meet are required. Screen sharing
must continue to require Chrome/macOS source selection and confirmation.

## Upload-gated checks

This repository deliberately does not mark the listing submission-ready. Before submitting for
review:

1. Merge the release candidate so the support/privacy URLs resolve publicly while signed out.
2. Supply the stable same-version plugin URL in the reviewer field.
3. Add a German localized detailed description and German screenshots in the dashboard because the
   packaged extension advertises a `de` locale. The promo tile remains global.
4. Upload the exact packaged ZIP as a draft and confirm ZIP/manifest acceptance, generated
   permission warnings, field counters, available category/language values, image MIME/size
   acceptance, screenshot ordering, URL validation, and rendered previews.
5. Reconcile any dashboard wording/taxonomy change with `listing.json`; then change
   `submissionReady` only in the actual release/submission change.

A draft cannot establish policy approval, title/trademark acceptance, or promo-image approval. Those
decisions occur in Chrome Web Store review; do not claim approval based on local validation.

## Official references

- [Supplying images](https://developer.chrome.com/docs/webstore/images)
- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Complete your listing information](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Fill out the privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Provide test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions/)
- [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq/)
