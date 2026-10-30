# Privacy, data-flow, and permissions worksheet

**Later analytics implementation:** the optional consent-gated `@posthog/core`
integration and private 1.0.30/code 31 testing APK are documented in the
[implementation record](../play-product-analytics-2026-10-28.md) and
[physical QA follow-up](../play-product-analytics-phone-2026-10-28.md).
The no-analytics inventory below describes older artifacts; it must not be used
as the current Data safety declaration. The new event/identity flow sends only
reviewed pseudonymous events to the fixed EU ingestion endpoint after consent.

**Current audit (28 October 2026):** see the [dated evidence and data-flow audit](privacy-audit-2026-10-28/EVIDENCE_AND_DATA_FLOW.md) for the capture-enabled 1.0.29/code 30 APK/AAB, packaged backup exclusions, resolved dependencies and live privacy page. Runtime traffic and owner/publication gaps remain open in its [question tracker](privacy-audit-2026-10-28/OPEN_QUESTIONS.md). The r3/r4 observations below are retained as historical evidence; they are not the current release declaration.

Complete this with an artifact-backed audit before Play submission. The r3 unsigned APK/AAB and merged manifest are available; source observations below still require network inspection of that build and owner review.

## Data inventory

| Data | Purpose | Location / lifetime | Network destination | Status / evidence needed |
|---|---|---|---|---|
| Imported/recorded audio | Trim and local playback | `Paths.document/play-library`; audio named by validated clip UUID and extension; delete removes owned audio after metadata commit | None intended | `app-play/src/data/library.ts`, `src/data/snapshot.ts`; verify with proxy/network capture and installed r3 candidate |
| Clip names, board labels, trim/gain/layout preferences | Render and restore app state | `boards.json` v1, `catalog.json` v1, `preferences.json` v5, `presentation.json` v1, `clip-playback.json` v1, with backup/next snapshots and transaction journal | None intended | Source schema/transaction code and tests; valid backup/pending snapshots recover automatically. Initial r3 restore failed because journal staging reused a mutated `File` handle. A fresh per-transaction journal file fix passed the 200-test suite and the same physical backup restored deleted QA AAC/board data on r4. Broader restore/schema coverage remains open. If both committed snapshots/journal are corrupt, the app fails closed and preserves files. |
| Gallery artwork | Optional local pad image | `play-library/artwork`; bounded JPEG thumbnail (512 px max side) | None intended | `src/media/artwork.ts`; verify picker grants and private-file deletion on device |
| Microphone audio | User-initiated foreground recording | Temporary cache source, then local editor/library flow | None intended | `src/media/recording.ts`; contextual permission and recording tests exist; physical permission/interruption matrix remains |
| Device playback capture | Owner requires this in the final candidate; r4 artifact enables it | Local bounded capture file | None intended | On r4, consent cancellation left no projection; a controlled synthetic fixture capture saved an audible trim, notification Stop closed a fresh session, and a no-usable-audio session saved nothing. Broader Android/source-app compatibility and actual release traffic remain to verify. |
| Crash, analytics, ads, account identifiers | No crash/analytics/ads/account SDK appears in `app-play/package.json` | No intended app-managed collection | No app endpoint found in the inspected Play source; OS/share picker and Play services may communicate independently | Still inspect resolved dependency graph and actual release traffic before final Data safety declaration |

## Outbound calls to inventory

For every release dependency and request, list host, purpose, request fields, identifiers, retention, user choice, TLS behavior and policy declaration. Inspect cold start and flows for import, playback, gallery, microphone, backup/restore, settings and error reporting, both online and offline. Record proxy logs with sample media and personal names excluded.

| Endpoint / SDK | Trigger | Data sent | TLS / identifiers | Retention / opt-out | Evidence |
|---|---|---|---|---|---|
| No app backend, analytics or ad endpoint identified in Play source | No app-owned network feature identified; Settings `Report a problem` opens Android Share UI with only a user-authored message and no automatic files | User controls any later share target/content | Target app/platform handling is outside Stimmyz control | Verify complete resolved dependencies and proxy trace of final release |
| Android system Gallery/document picker and optional share target | User taps Gallery, Import, Restore, Export or Report a problem | Provider metadata/content selected by the user; explicit export writes a copy to chosen location | Android grants/OS/provider behavior | Device verify URI grants, cancellation, offline behavior, and no unintended upload |

## Permission map

| Android permission / capability | Reason | Default production build | Evidence / next action |
|---|---|---|---|
| `RECORD_AUDIO` | User-selected microphone recording | Expected | Present in r3 merged manifest; contextual permission-denial and recording-interruption paths still need device testing |
| `FOREGROUND_SERVICE` | Device playback capture service | Required if the final candidate ships the approved capture flow | Absent from historical r3 merged manifest and APK/AAB permission inventory; verify the new candidate |
| `FOREGROUND_SERVICE_MEDIA_PROJECTION` | Projection capture | Required for the final candidate's capture flow | Absent from historical r3 merged manifest and APK/AAB permission inventory; verify new candidate declaration and behavior |
| `POST_NOTIFICATIONS` | Visible stop notification for capture | Review requirement for the capture-enabled candidate | Review merged artifact and runtime notification behavior |
| Broad media/storage, overlay, camera, location, contacts, accessibility | Not needed for current local picker/gallery flow | Must be absent | Build script blocks selected broad/overlay permissions; review complete merged permission list |
| Internet | Framework/library behavior | May be injected by Android toolchain | Inspect final manifest and runtime network traffic before Data safety declaration |

## Data safety and user-facing disclosure

- Public privacy policy URL: **TBD — owner must publish [the draft](PRIVACY_POLICY_DRAFT.md) at an approved stable HTTPS URL**.
- In-app device privacy disclosure exists in Settings → About → Privacy on this device; it explains private local storage, export choice, microphone initiation, capture-build state and no automatic report attachments. It does not replace a public policy URL.
- Privacy policy text draft: [PRIVACY_POLICY_DRAFT.md](PRIVACY_POLICY_DRAFT.md). A public HTTPS URL and monitored owner contact are required before Play submission.
- Data safety declaration owner/review date: **TBD**.
- Describe local-only storage, deletion/uninstall consequences, microphones, device-audio capture, SDK collection, support contact, and backup behavior accurately.
- Disclose device-audio capture before OS consent and submit the matching foreground-service declaration/demo with the capture-enabled candidate.
- Do not auto-attach recordings, filenames, consent results, raw audio or identifiers to support diagnostics.

## Backup policy

Play source config disables Android backup and writes explicit full-backup exclusions plus Android 12+ cloud/device-transfer exclusions. Verify the merged APK resources and test a supported device-to-device transfer path; platform/manufacturer behavior may vary.
