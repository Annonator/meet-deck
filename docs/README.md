# Meet Deck documentation

Meet Deck is a privacy-first, open-source bridge between an Elgato Stream Deck and Google Meet. It
is published by **annonator** under the plugin UUID `dev.annonator.meet-deck`. The source is
released under the MIT License.

The English documents are the canonical references for releases and store reviews. The German
documents cover the same operating and security model for users and contributors.

| Topic                        | English                            | Deutsch                              |
| ---------------------------- | ---------------------------------- | ------------------------------------ |
| Architecture and data flow   | [Architecture](en/architecture.md) | [Architektur](de/architecture.md)    |
| Installation and pairing     | [Setup](en/setup.md)               | [Einrichtung](de/setup.md)           |
| Data handling                | [Privacy](en/privacy.md)           | [Datenschutz](de/privacy.md)         |
| Trust and threat boundaries  | [Security](en/security.md)         | [Sicherheit](de/security.md)         |
| Release and store submission | [Publishing](en/publishing.md)     | [Veröffentlichung](de/publishing.md) |
| Real-device acceptance tests | [Hardware E2E](en/hardware-e2e.md) | [Hardware-E2E](de/hardware-e2e.md)   |

The project has no cloud service, accounts, analytics, advertising, or telemetry. The Chrome
extension only connects to the Stream Deck plugin over a paired loopback WebSocket.
