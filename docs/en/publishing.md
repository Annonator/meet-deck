# Publishing

Meet Deck is published publicly by **annonator**. The Stream Deck plugin UUID is permanently
`dev.annonator.meet-deck`; changing it would create a different plugin and break installed profiles.

## Release model

- Use SemVer Git tags of the form `vX.Y.Z`.
- Keep the root and workspace package metadata, lockfile, Chrome manifest, and Stream Deck four-part
  manifest versions aligned (`X.Y.Z` and `X.Y.Z.0`).
- GitHub is the canonical source and build provenance.
- GitHub Actions builds release artifacts but does not hold Chrome Web Store or Elgato Marketplace
  publishing credentials. Store submission is manual and separately reviewed.

## Pre-release checklist

1. Start from a clean commit intended for release.
2. Confirm public names, icons, descriptions, and privacy text use `annonator` and
   `dev.annonator.meet-deck`.
3. Confirm required extension permissions remain limited to `storage` and `alarms`, plus the
   Meet-only content script. Confirm optional host access is limited to the exact configured
   `ws://127.0.0.1:<configured port>` origin through the `ws://127.0.0.1:<configured port>/*` match
   pattern requested by **Pair and connect** or **Connect**, with no wildcard scheme/host/port, LAN,
   or all-URL access, and that the loopback WebSocket CSP remains narrow. Explain that `alarms` only
   schedules a local bridge reconnect wakeup and carries no meeting data; explain every permission
   in the Chrome listing.
4. Run `npm ci`, `npm run release:verify -- vX.Y.Z`, `npm run check`, and `npm run pack` with
   Node 24.
5. Complete [hardware E2E](hardware-e2e.md) on the declared minimum and current supported
   Chrome/Stream Deck versions, including loopback permission already-granted, allow, deny, revoke,
   and port-change paths plus screen-share cancellation.
6. Review the built extension rather than the source directory: no source maps with secrets, remote
   code, unexpected host patterns, or development URLs.
7. Review the plugin with `npm run validate` and install the packed artifact on a clean Stream Deck
   profile.
8. Update release notes with user-visible changes, compatibility changes, security/privacy impact,
   and known Google Meet UI limitations.

Push the release commit to `main` and wait for its CI run to pass. Then create an annotated (and,
when available, signed) `vX.Y.Z` tag on that commit and push it. The release workflow rejects tags
whose commit is not contained in `main`, derives `X.Y.Z` from the tag, and fails on any package,
lockfile, manifest, or internal dependency version mismatch.

Pull requests and every pushed commit on `main` run the complete format, lint, type-check, test,
build, validation, and packaging gate. Pull-request reruns supersede stale runs, while post-merge
`main` runs are never cancelled by a later merge. Release builds have read-only repository access;
only the separate publish job receives permission to create the GitHub Release after all gates and
artifact checks pass.

## GitHub release artifacts

The automated release publishes exactly these user-facing files:

- `dev.annonator.meet-deck.streamDeckPlugin`
- `meet-deck-chrome-vX.Y.Z.zip` (the contents of the built `dist`, with `manifest.json` at the ZIP
  root)
- `SHA256SUMS.txt`

CI also retains validation/build logs as workflow evidence. Checksums are generated after final
packaging and verified once before upload. Never include `node_modules`, test fixtures, local
settings, pairing material, `.env` files, or store credentials.

## Chrome Web Store

1. Register the `annonator` publisher identity and protect it with strong MFA.
2. Upload the exact extension ZIP from the GitHub release; do not rebuild it locally for the store.
3. Supply a complete English default listing and a German localized listing, each matching the
   extension's supported localized UI. Never publish English claims against a German-only build or
   advertise another unsupported language. Provide localized descriptions plus the support,
   repository, and current English/German privacy links; screenshots remain a separate dependent
   task.
4. Declare the single-purpose use: local Stream Deck control of Google Meet.
5. Keep the Privacy practices dashboard consistent with the [privacy notice](privacy.md). Under the
   current taxonomy, disclose Website content for transient supported Meet control inspection/
   derived state and Authentication information for the separate local random Meet Deck pairing
   credential; do not claim zero handling merely because it remains on-device. Affirm compliance
   with the Chrome Web Store User Data Policy, including its Limited Use requirements.
6. Explain `storage`, reconnect-only `alarms`, `https://meet.google.com/*`, and the optional exact
   `ws://127.0.0.1:<configured port>/*` host match-pattern request from **Pair and connect** or
   **Connect**. Cover already-granted, denial, future-connection/reconnect blocking after
   revocation, and port-change behaviour, pairing, the lack of LAN/all-URL access, and why no data
   is sold, remotely processed, or used for advertising/analytics. State that alarms hold only a
   fixed name/schedule and no meeting data.
7. Provide reviewer steps covering pairing and a test Meet. The reviewer must still choose a share
   source in Chrome's picker.
8. After approval, record the store item/version in the GitHub release notes and verify the
   Store-installed extension can pair with the released plugin.

Do not add a remote update/configuration service or remotely hosted executable code. Any future
permission expansion requires a design/security review and an updated privacy notice before
submission.

## Elgato Marketplace

1. Use the `annonator` maker identity and the fixed plugin UUID.
2. Upload the exact `.streamDeckPlugin` file from the GitHub release.
3. Provide the required app icon, 1920×960 thumbnail, gallery images, English description, release
   notes, support/repository link, and privacy link.
4. State that the companion Chrome extension is required, local-only, and that screen-share source
   confirmation cannot be bypassed.
5. Give review steps for installing/pairing the extension and testing all four actions.
6. When approved, confirm installation, update behaviour, and the Marketplace listing on a clean
   profile.

If a marketplace wrapper obscures the plugin artifact, keep the matching, auditable GitHub artifact
and checksum available under the same version.

## Rollback and security releases

Never move or replace an existing Git tag or GitHub artifact. For a defective release, mark it
affected, withdraw store availability if necessary, and publish a new patch version. A
protocol-breaking release requires an explicit migration plan; version 1 peers must fail closed on
an unsupported protocol.

## Official submission references

- [Chrome Web Store developer registration](https://developer.chrome.com/docs/webstore/register/)
- [Prepare an extension for the Chrome Web Store](https://developer.chrome.com/docs/webstore/prepare/)
- [Optional extension permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Localize a Chrome Web Store listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing/)
- [Chrome Web Store privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy/)
- [Chrome Web Store Limited Use policy](https://developer.chrome.com/docs/webstore/program-policies/limited-use/)
- [Elgato plugin distribution](https://docs.elgato.com/streamdeck/sdk/introduction/distribution/)
- [Elgato Marketplace submission](https://docs.elgato.com/maker-console/submitting-products/)
