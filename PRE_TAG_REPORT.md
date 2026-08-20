# Meet Deck pre-tag report

## Post-report security remediation — 2026-08-20

- **Current GitHub release decision:** GO
- **Chrome Web Store / Elgato Marketplace submission decision:** NO-GO until their separately listed
  submission requirements are complete

`MD-PAIR-001` is remediated in the current working tree. Pairing now uses a 125-bit, short-lived key
that never crosses the WebSocket. The plugin and Chrome companion exchange role-separated HMAC
proofs over fresh nonces and the exact extension origin before the plugin issues a credential. The
companion rejects an unproved local peer without sending its proof or storing the peer's token. The
plugin also refuses to open or display pairing unless its genuine loopback listener is active, and
the property inspector disables pairing while the listener is unavailable.

Current automated and package evidence:

- `npm run check`: PASS — formatting, lint, release metadata, both listing validators, typecheck,
  189 tests, all builds, and Stream Deck validation.
- Real occupied-port regression: PASS — `EADDRINUSE` remains visible and no pairing key is created.
- Hostile-loopback regression: PASS — the key is absent from `pair.hello`, an invalid server proof
  is rejected, no client proof is returned, and no attacker-chosen token is stored.
- Legitimate pairing/control regression: PASS — mutual pairing proofs, durable token storage, mutual
  session authentication, protected state, and a protected microphone command still work.
- `npm run pack` plus checksum, archive-integrity, entry-count, and packed-bundle checks: PASS for
  the regenerated installable artifacts.
- Regenerated Chrome ZIP SHA-256:
  `c40db3b4373422a0d970cd5ae00f4b6a4efc03fa2e116dd5a08480c7b2bf041d`.
- Regenerated Stream Deck package SHA-256:
  `f7c93f72dab8adb3d23d4b9b45dac47a803259f2c7a7a72d20ae202266ca5b65`.

The original report below remains a preserved account of the 2026-08-19 candidate and its checksums.
Its `MD-PAIR-001` finding is superseded by this addendum; its other NO-GO items are not. In
particular, the separate store-submission requirements remain outstanding.

The release owner confirmed on 2026-08-20 that the installed fixed Stream Deck plugin and updated
unpacked companion work on the physical hardware path. The installed plugin binary and Property
Inspector matched the verified build byte-for-byte, and its IPv4 loopback listener was active. The
observed browser was Microsoft Edge, so this owner acceptance closes the GitHub-release hardware
gate but does not claim completion of the Google Chrome-specific store acceptance matrix.

- **Decision:** NO-GO
- **Candidate version:** `0.1.0`
- **Candidate release-content SHA:** `a24aaff792f87498a803cdd7ce64e4f184ca5642`
- **Integration base:** `8303247a0bfce5b8ba02760a1f401a1d33fc7671` (`origin/main`)
- **Report date:** `2026-08-19T14:34:07+02:00`
- **Tag, push, release, publication, or store submission performed:** No

The candidate SHA contains every release-affecting source, documentation, store-kit, and hardware
report change. The installable artifacts recorded below were generated from exactly that SHA. This
report is the only file in a report-only child commit; the final child SHA is necessarily reported
outside this file because a commit cannot contain its own SHA.

## Integration boundary

All five prerequisite tasks were read after completion. The final graph is linear and eight commits
ahead of the exact merge base.

| Prerequisite                   | Task ID                                | Reported tip                               | Local unique commit(s)                                                                 | Duplicate imports skipped                                                              |
| ------------------------------ | -------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Chrome pre-tag compliance      | `01a01989-9640-7ca2-b939-e2f1ddec9326` | `17df7466b126d06bda153a17460ffa78486e08c4` | `1e28540ff140427cf676a095ec7e5b58a9ec1727`                                             | none                                                                                   |
| Stream Deck pre-tag compliance | `01a01989-963f-7001-b1d4-b51a9e8afd1d` | `75d7d1e67f0d5bcc2e2dc74c87c87483bf930571` | `fd0562cb8a96b57bc61fb3deebecdc85f0ccae16`                                             | none                                                                                   |
| Chrome Web Store listing kit   | `01a0198c-69ca-7b31-9dea-35b3607f0a0a` | `469814a70f93f8396b1e29cd483950e415058625` | `4fbe48ab39d5da20d755177e5d4638c4b0f55574`                                             | `c42352d9f2d9ac073ae0fe2b620e8c477eb8d9ba`                                             |
| Elgato Marketplace listing kit | `01a01989-963f-7001-b1d4-b5377ab1df73` | `26dc646679d76e5ef12f7d04867422c3f6780bbd` | `a87a3c14cefd52b8270dc771610771cb2c01e56b`                                             | none                                                                                   |
| Integrated hardware acceptance | `01a0198c-69d0-7972-9e6e-6bda564615e4` | `91c561f4bc087d1b580c242f5842a5d621256786` | `a17d1d8f3ab9dc809b9e661ccb9afcc65eccbafa`, `12e82260b81a6617059810723911a5d8c4d33949` | `9b4305a061252a771e0b11a0b721f7df5706ddb4`, `554732dc18dd8079a7a86be58c510f5719851132` |

`17df7466`, `c42352d`, and `9b4305a` have identical tree `2499832b3847e1eb1142b93a41104fced16d9792`
and stable patch ID `3e19fe664937c1cf36a2a3cda326a1a64a104660`. `75d7d1e6` and `554732d` have stable
patch ID `81a26f555323c72fe12d21f43e54cdba28c1296c`. Only the original prerequisite commits were
applied. No unique prerequisite change is missing and no patch occurs twice.

Two release-gate reconciliation commits follow the prerequisites:

- `94de864392b836674152b96ea91a34fc44dbf6f1` aligns the localized Chrome manifest name, macOS 13
  minimum, EN/DE terminology, both store validators, CI coverage, and store media. It also prevents
  a blank 1920x960 renderer output from passing validation.
- `a24aaff792f87498a803cdd7ce64e4f184ca5642` narrows prominent privacy copy to the implementation
  truth: Meet Deck does not access meeting media and sends none to the plugin.

Conflict resolution retained the SHA-pinned upstream workflows and `release:verify`, exact Chrome
ZIP allowlist, `rollup --forceExit`, generated Stream Deck icons, and both listing validators. Root
`check` runs the Chrome store validator only after build. `git diff --check origin/main..a24aaff`
passes; the candidate changes 84 files with 7,770 insertions and 389 deletions, all attributable to
the prerequisites or the two narrow reconciliations.

## Clean build and validation

- **Runtime:** macOS `26.6.1` (`arm64`), Node `24.13.1`, npm `11.19.0`
- **Initial tracked tree:** clean
- **Final tracked tree after packaging:** clean; only the expected ignored build/package outputs
  exist

Generated outputs were first reviewed with, then removed by, the same explicit path allowlist:

```sh
git clean -ndX -- artifacts coverage packages/protocol/dist \
  apps/chrome-extension/dist \
  apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/bin
git clean -fdX -- artifacts coverage packages/protocol/dist \
  apps/chrome-extension/dist \
  apps/streamdeck-plugin/dev.annonator.meet-deck.sdPlugin/bin
```

No repository-wide clean was used.

| Command                                                        | Result                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                       | PASS; exact lock installed 292 packages. npm reported only the unapproved optional `fsevents@2.3.3` install script; it was not executed or approved.                                                                                                                                                                              |
| `npm run check`                                                | PASS with network access for the official Elgato URL check: format, lint, release metadata, both listing validators, typecheck, 185 tests, build, and Stream Deck validation. An earlier sandboxed attempt reached the same final validator but could not resolve its URL; outputs were cleared before the successful full rerun. |
| `npm test`                                                     | PASS: protocol 37, Chrome 110, Stream Deck 38; 185 total.                                                                                                                                                                                                                                                                         |
| `npm run build`                                                | PASS for all three workspaces.                                                                                                                                                                                                                                                                                                    |
| `npm run validate:listing-assets`                              | PASS: five Elgato PNGs, canonical copy, requirements, and absent/capture-required MP4 state.                                                                                                                                                                                                                                      |
| `npm run store:validate`                                       | PASS after build: promo, three screenshots, 128px icon safe area, listing metadata, and package separation.                                                                                                                                                                                                                       |
| `npm run validate`                                             | PASS: strict repository bundle validator and official Elgato CLI.                                                                                                                                                                                                                                                                 |
| `npm run pack`                                                 | PASS; recreated all three files in `artifacts/` without publishing.                                                                                                                                                                                                                                                               |
| `npm audit --omit=dev`; `npm audit`                            | PASS; zero known vulnerabilities in production and full locked graphs on the report date.                                                                                                                                                                                                                                         |
| CI artifact verification block from `.github/workflows/ci.yml` | PASS: checksums, exact 17-entry Chrome allowlist, two locales, forbidden-entry scan, two checksum rows, and exactly three artifact files.                                                                                                                                                                                         |
| `unzip -tqq` on both installable archives                      | PASS.                                                                                                                                                                                                                                                                                                                             |
| `validate-bundle.mjs --artifact ...streamDeckPlugin`           | PASS: 40 safe package entries exactly match the 41-file source bundle contract.                                                                                                                                                                                                                                                   |
| `git status --porcelain=v1 --untracked-files=all`              | PASS; empty.                                                                                                                                                                                                                                                                                                                      |

The official Elgato CLI required network access only to verify public manifest URLs; all build,
test, archive, secret, and content checks remained local.

## Release artifacts

| Path                                                 |   Bytes | SHA-256                                                            | Source SHA                                 |
| ---------------------------------------------------- | ------: | ------------------------------------------------------------------ | ------------------------------------------ |
| `artifacts/meet-deck-chrome-v0.1.0.zip`              | 150,594 | `3458a9c7322acbf27d47c241e20d59cc74db5127f78e0edc44c12e2a8780d1e6` | `a24aaff792f87498a803cdd7ce64e4f184ca5642` |
| `artifacts/dev.annonator.meet-deck.streamDeckPlugin` | 195,670 | `2c759eb848b0f215f6707070eb659ad91de5e620633e6f65b34918c13b40b74c` | `a24aaff792f87498a803cdd7ce64e4f184ca5642` |
| `artifacts/SHA256SUMS.txt`                           |     201 | `9b7ca16ab0e08c6b91ed84ab26b9d05aaf91c4718e2068b505f0f0ab5b257dbd` | `a24aaff792f87498a803cdd7ce64e4f184ca5642` |

The Chrome ZIP has exactly 17 allowed root-relative files. The Stream Deck package has exactly 40
files below `dev.annonator.meet-deck.sdPlugin/`. Both pass CRC checks and contain no traversal or
absolute paths, `node_modules`, `.DS_Store`, source maps, `.env`/key/certificate files, credentials,
logs, test fixtures, local settings, pairing data, or unexpected runtime endpoints. Expected network
strings are limited to the public repository/support/schema references, `https://meet.google.com/*`,
and IPv4 loopback WebSockets.

## Version and product identity

| Surface                                | Final value                                                         | Result |
| -------------------------------------- | ------------------------------------------------------------------- | ------ |
| Root, lockfile, all workspace packages | `0.1.0`                                                             | PASS   |
| Chrome manifest and Elgato listing     | `0.1.0`                                                             | PASS   |
| Stream Deck manifest                   | `0.1.0.0`                                                           | PASS   |
| Publisher / plugin UUID                | `annonator` / `dev.annonator.meet-deck`                             | PASS   |
| macOS / Chrome / Stream Deck minimum   | `13` / `147` / `7.1`                                                | PASS   |
| Chrome permissions                     | `storage`, `alarms`                                                 | PASS   |
| Optional host grant                    | `ws://127.0.0.1/*`; runtime requests only the configured exact port | PASS   |
| Content-script scope                   | `https://meet.google.com/*` only                                    | PASS   |
| Locales                                | Chrome companion and supported Meet controls: EN/DE                 | PASS   |

No version was changed during this gate.

## Store kits and cross-surface coherence

Runtime manifests, README, EN/DE setup/privacy/security/publishing documents, both listing kits,
reviewer steps, and Marketplace release notes agree on four actions, one unambiguous joined meeting,
authenticated IPv4-loopback transport as the design, user-controlled share-source selection, EN/DE
support, macOS 13+, Chrome 147+, Stream Deck 7.1+, version `0.1.0`, and draft/not-published state.
The security exception identified below prevents the authentication claim from being accepted as
release-ready despite that textual consistency.

### Chrome Web Store

Canonical metadata is `apps/chrome-extension/store/listing.json`; the submission sheet is
`apps/chrome-extension/store/SUBMISSION.md`; editable/generated media is under
`apps/chrome-extension/store/`. Local validation and visual inspection pass.

| Media                         | Dimensions                               | SHA-256                                                            |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `small-promo-440x280.png`     | 440x280                                  | `2d79aedd472a8a1dcdf82d50da8ad17e11d670a4fc61b559cb365cbf6ddd767d` |
| `01-pair-locally.png`         | 1280x800                                 | `e04a8d9f4d1e30cdfd768d84d4e3c6fba84ef9c50b82a54a21c6913487ffaa5b` |
| `02-connected-controls.png`   | 1280x800                                 | `7c9508c9ea5a37ba44e55a3809ef61999e50dcb3df469e6045a8569411b18174` |
| `03-private-by-design.png`    | 1280x800                                 | `20886896c83b4deb87b7d132d43d9d67cc85cfbd5ccf78064afdc74d643ff249` |
| packaged `icons/icon-128.png` | 128x128 with compliant transparent inset | `e3faf8a9a7cd00391fb8e3271027a18b2113e7e131613b5dab1a896979b41669` |

The kit covers title/summary/description, single purpose, minimum permissions, data-use answers,
remote-code answer, reviewer steps, and exact privacy/support/repository URLs. Chrome has no
separate release-note field in this kit. It correctly remains `submissionReady: false`: the stable
same-version plugin URL is null; German dashboard description/screenshots, a draft upload, dashboard
warnings, field/image/URL validation, and review decisions remain external.

### Elgato Marketplace

Canonical metadata is `marketplace/listing.json`; submission guidance and remaining work are in
`marketplace/README.md`; editable artboards and generated exports are under `marketplace/assets/`.

| Media                               | Dimensions | SHA-256                                                            |
| ----------------------------------- | ---------- | ------------------------------------------------------------------ |
| `meet-deck-app-icon.png`            | 288x288    | `f4a7bb196b29791ee645d84031cbe7040f81c14f84e74e57fa7225ecd02f7165` |
| `meet-deck-thumbnail.png`           | 1920x960   | `fe15da2186af9e697252c3df356f1952267bc2290a22d813b2d28a205f7eee1a` |
| `meet-deck-gallery-01-controls.png` | 1920x960   | `467c3569146411f1e15e806ff4bc6c6c5a770542003f34eb035c247cc2b19180` |
| `meet-deck-gallery-02-pairing.png`  | 1920x960   | `d9afcb6eecad2af0f2f35f9a2de98c9c509134d0c3ab9343c44f7853f158e6be` |
| `meet-deck-gallery-03-privacy.png`  | 1920x960   | `08b0b1d7a982a4d7180c89ca1c8a0a58448f333e62fdaf0612ccdfba4380ad32` |

Copy, reviewer steps, links, UUID, compatibility, and `0.1.0` release notes validate. The required
functional 1920x1080 MP4 is honestly absent with status `capture-required`; the storyboard is
present. Maker organization/agreement/support/pricing/name confirmation, the companion review-ZIP
delivery channel, uploads, review, and clean post-approval install remain external.

Requirements were checked against the current official
[Chrome media guidance](https://developer.chrome.com/docs/webstore/images),
[Chrome user-data policy](https://developer.chrome.com/docs/webstore/user_data),
[Elgato product media guidance](https://docs.elgato.com/guidelines/products/),
[Elgato plugin guidance](https://docs.elgato.com/guidelines/stream-deck/plugins/), and
[Elgato submission guidance](https://docs.elgato.com/maker-console/submitting-products/).

## Security, privacy, licensing, and provenance

### Blocking finding: local plugin impersonation during first pairing

`MD-PAIR-001` is a validated, pre-existing Medium/P2 issue, not an integration regression. Under an
occupied configured loopback port, first pairing can continue without the genuine plugin listener
and the extension cannot establish that the bootstrap peer is the plugin. This violates the
repository's stated hostile-local-process boundary and makes the current plugin-authentication claim
unreleasable.

A focused runtime bind-conflict harness and the existing isolated handshake/command test both passed
and confirmed the affected state transition. Impact is bounded to privacy-minimized state plus the
supported microphone, camera, hand, focus, and presentation commands; there is no raw media/chat/URL
access, arbitrary JavaScript, or share-picker bypass. Existing origin, schema, HMAC, replay,
one-meeting, DOM-revalidation, and user-consent controls remain useful but do not repair the
bootstrap identity gap.

Detailed reproduction evidence is intentionally withheld from this public-intended report while the
issue is unpatched. Fix it in a dedicated security change, add occupied-port and hostile-peer
regression coverage, and repeat exact-artifact hardware acceptance before a tag.

Other audit results:

- high-signal tracked-file and extracted-archive scans found no credentials, private keys,
  certificates, cloud/vendor tokens, JWTs, credential URLs, or sensitive filenames;
- no production `eval`/`Function`, unsafe HTML injection, dynamic remote scripts, remote runtime
  code, or unexpected network sink was found; CSPs are self-only plus exact Meet/loopback needs;
- Chrome sender/origin/document checks, finite protocol schemas, secret storage restrictions, safe
  logging, and privacy-minimized message shapes are present;
- root and shipped bundle licenses are byte-identical MIT copies; third-party notices cover bundled
  Elgato packages, `zod`, and `ws`;
- Chrome icons and both store kits have checked-in generators/editable sources. Eighteen
  pre-existing colored Stream Deck runtime PNGs lack an editable source or explicit
  original-work/rights record. Owner provenance and trademark/brand confirmation are required before
  Marketplace upload;
- two already-public `origin/main` commits expose the owner's personal email as committer metadata.
  Candidate commits use GitHub noreply addresses, archives contain no Git history, and published
  history was not rewritten.

## Public URLs

Signed-out checks on `2026-08-19` returned HTTP 200 for all four canonical URLs:

| Purpose    | URL                                                                   | Result |
| ---------- | --------------------------------------------------------------------- | ------ |
| Repository | `https://github.com/Annonator/meet-deck`                              | 200    |
| Support    | `https://github.com/Annonator/meet-deck/issues`                       | 200    |
| Privacy    | `https://github.com/Annonator/meet-deck/blob/main/docs/en/privacy.md` | 200    |
| Setup      | `https://github.com/Annonator/meet-deck/blob/main/docs/en/setup.md`   | 200    |

Public `main` is still the integration base `8303247a0bfce5b8ba02760a1f401a1d33fc7671`. Candidate
privacy, security, and setup documents differ, so the URLs are reachable but their release content
remains stale until a later authorized merge/push. GitHub private vulnerability reporting is
disabled and no repository `SECURITY.md` or safe private contact exists, despite the documentation's
“private security-reporting channel when available” direction. Establish that channel before store
submission; do not report the pairing details in a public issue.

## Hardware acceptance

The committed report is `docs/acceptance/2026-08-19-pre-tag-hardware-e2e.md`. It records exactly
**23 PASS, 0 FAIL, and 69 NOT RUN**, hence **INCOMPLETE**.

It is historical evidence for implementation `9d7659bf7606f0977f242dd121d8287088a09bbe`, Chrome ZIP
`2640c561f8fc383bdd39678cb9c3ca6a768795fbec4e1410730bc0ce862028a4`, Stream Deck package
`246122567219dd37b4a6198263165ffc229970bf2225a757bd4fa8f943c74b84`, and 183 automated tests. That
SHA is not an ancestor of the final candidate; its checksums/test count are superseded and are not
evidence for the final archives above. `LIFE-18` remains limited code-level evidence of one observed
loopback bind, not final-archive installation or end-to-end acceptance.

The exact final archives have not been installed together on physical hardware. Pairing, occupied-
port behavior (`LIFE-11`), permission allow/deny/revoke, targeting, bidirectional controls,
presentation consent, lifecycle/reconnect/USB/faults, EN/DE behavior, and live
privacy/log/credential inspection remain unrun. Every required row must pass with sanitized evidence
against the exact final checksums before this gate can change.

## Current blockers

| Blocker                                         | Required completion evidence                                                                                                        | Gate effect                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `MD-PAIR-001` local plugin impersonation        | Reviewed fix, regression tests, and exact-artifact live port-conflict/hostile-server acceptance                                     | NO-GO for tag/release        |
| 69 hardware rows not run on final archives      | Sanitized complete report with zero required failures and the final checksums                                                       | NO-GO for tag/release        |
| Chrome listing remains `submissionReady: false` | Stable plugin URL, public final docs, German dashboard localization, accepted draft upload/warnings/fields/media/URLs/reviewer flow | NO-GO for Chrome submission  |
| Functional Elgato MP4 absent                    | Sanitized real-hardware 1920x1080 MP4 below the recorded size cap                                                                   | NO-GO for Elgato submission  |
| Maker Console/reviewer setup incomplete         | Name/org/agreement/support/free choice, companion ZIP channel+SHA, uploads, review, clean-install evidence                          | NO-GO for Elgato submission  |
| Private security contact absent                 | Enabled private vulnerability reporting or another published safe private route                                                     | NO-GO for store submission   |
| Stream Deck asset rights evidence incomplete    | Owner provenance/rights and intentional brand-variant/trademark affirmation, or sourced replacements                                | NO-GO for Marketplace upload |

## Strict decision

- Local source/build/test/package gates: **PASS**
- Artifact integrity and checksum contract: **PASS**
- Chrome Web Store kit, local validation: **PASS**; submission prerequisites: **INCOMPLETE**
- Elgato Marketplace kit, local validation: **PASS**; submission prerequisites: **INCOMPLETE**
- Security boundary: **FAIL** (`MD-PAIR-001`)
- Integrated exact-artifact hardware acceptance: **INCOMPLETE** (69 `NOT RUN`)
- **Decision: NO-GO**

No tag, push, GitHub release, store publication, or store submission was performed.
