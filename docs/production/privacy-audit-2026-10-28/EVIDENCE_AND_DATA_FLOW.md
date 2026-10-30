# Evidence and data flows

Assessment: 28 October 2026. Scope: Play Android source and retained release-like
artifacts, local website source/build and the live public privacy page. Dev's
remote-media/YouTube product is excluded except for the exact shared leaves in
the Play staging allowlist. Its backend and tap-metrics behavior must not be
attributed to Play.

## Evidence labels and limits

- `VERIFIED_FROM_CODE`: a cited source/build configuration observation.
- `VERIFIED_FROM_ARTIFACT`: independently inspected retained package bytes/report.
- `VERIFIED_PUBLIC_RESPONSE`: dated public HTTP/DNS observation.
- `USER_CONFIRMED`: owner's answer in this chat on 28 October 2026.
- `UNKNOWN/REQUIRES_TEST`: not established by available evidence.
- `NOT_APPLICABLE`: conditional on the inspected scope and evidence stated.

Source, dependency and string scans cannot prove a release never transmits data.
OS picker/share destinations and host processing also need separate treatment.
No personal media, live inbox, private account settings or secrets were inspected.

## Build identity and provenance

Repository: `E:/Work/dev/soundboard`. Commit:
`b6d89ad30881022a12581f97a032ca311b0f35ab`, with existing user changes retained.
The inspected source configuration is `app-play/app.json:5,10-11`:
`dev.sarunas.soundboard.play`, version 1.0.29, code 30. Existing changes include
README/STEPS, App, app version and playback engine/tests; website is untracked.

Retained build directory: `data/play-creation-fix-build-20261026/`. Its inventory
records 26 October 2026, production-default capture ON, ARM64, release minification
and resource shrinking, API 24 minimum / target 36, Node 24.22.1 and Yarn 4.18.0.
All **104** listed inputs still match their SHA-256 in both the retained stage
and current repository. This does not claim a clean committed release or
independently reproduce the prior compilation. A fresh StageOnly run passed with
105 total files, including its inventory, and 64 source files.

| Artifact | SHA-256 |
| --- | --- |
| `soundboard-play-testing-capture-unsigned.apk` | `4ab4c2e066c9d6de517104cd310c3418fd8a99a0d6efe38da5ca466efb748c5d` |
| `stimmyz-1.0.29-testing.apk` (signed testing APK) | `c838cc558b307164c29979daa7447a32a1690ee42e362deb1945a6485b3e4544` |
| `soundboard-play-unsigned.aab` | `a7cce5ec2c6e42f819b98d2e411545097d374c4e3161377d201a2eb4af1d823c` |

`VERIFIED_FROM_ARTIFACT`: 934 comparable non-signature ZIP entries are identical
between signed and unsigned APKs, with no missing/extra non-signature entries.
The AAB's `base/assets/index.android.bundle` and `base/dex/classes.dex` match both
APKs. No new signature verification was run; the retained signing report records
v2/v3 verification. The AAB protobuf manifest was not decoded, and no Play-generated
split APK was inspected. Matching bundle/DEX does not establish all AAB settings.

Evidence: [release metadata](evidence/release-info.txt),
[recorded input inventory](evidence/retained-stage-inventory.json),
[hash comparison](evidence/stage-comparison.json),
[offline package report](evidence/artifact-inspection.txt).

## Resolved dependencies and initialization

`VERIFIED_FROM_CODE/ARTIFACT`:

- App dependencies are Expo 57 / React Native 0.86.2, audio, file/document/photo
  picker, image manipulation, safe area and NetInfo. No direct analytics, ads,
  billing or account SDK is declared (`app-play/package.json:7-22`).
- The retained `releaseRuntimeClasspath` report includes React Android 0.86.2,
  OkHttp 4.12.0, Fresco 3.6.0 and AndroidX startup. It contains no matches for
  PostHog, Firebase, Sentry, Amplitude, Segment, AppsFlyer, Adjust, Google ads or
  measurement, or BillingClient markers checked. See the exact
  [family scan](evidence/dependency-family-scan.json) and
  [resolved graph](evidence/gradle-release-runtime-dependencies.txt).
- Known telemetry namespace scans of DEX in all three packages returned zero
  hits; the retained R8 mapping also had no searched known telemetry-family class
  declarations. Obfuscation/native code/other namespaces can defeat such scans.
- Packaged native libraries include React Native/Hermes, Expo, image/audio
  libraries, FFmpeg codec/format/util/resample libraries and app playback DSP.
  Filenames are inventoried, not a complete behavioral audit of native code.
- APK startup metadata includes Expo updates **disabled**. The remaining
  check-on-launch value does not override that disabled flag. AndroidX startup
  metadata initializes EmojiCompat, lifecycle and profile installation.
- The manifest's disabled `com.google.android.gms.metadata.ModuleDependencies`
  service declares the optional photo-picker module. Its class name alone is
  not evidence of Firebase Analytics or active Google telemetry.
- The Play import graph is allowlisted and excludes the Dev YouTube module.
  NetInfo is declared/autolinked, but no Play app-owned invocation or telemetry
  sink was found in the inspected graph. Networking libraries and permissions
  remain available.

Source search covered Play production JS/TS/Kotlin/C++ and the staged shared
leaves, excluding tests, notices and images. No app-owned `fetch`, XHR, WebSocket,
analytics invocation, `console` logger or Android `Log` call was found. License
URLs and legacy Imgflip provenance are data strings, not evidence of a request.
No app-owned server domain was identified. Actual SDK/network destinations remain
`UNKNOWN/REQUIRES_TEST`, including start, idle, error and background paths.

## Manifest, permissions and entry points

The offline inspector decoded each APK's binary manifest and resolved its
obfuscated backup resources through `resources.arsc`. Its permission list matches
the retained [manifest dump](evidence/merged-AndroidManifest.xml) and
[permission list](evidence/permissions.txt).

| Packaged permission/capability | Source purpose / observation | Status |
| --- | --- | --- |
| `RECORD_AUDIO` | Mic recording and Android playback capture permission, requested in those user flows | Artifact present; runtime permission/interruption coverage still needed |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PROJECTION` | Private device-audio service; explicit OS projection consent | Artifact present; not evidence of background microphone recording |
| `POST_NOTIFICATIONS` | Capture status with Stop; capture flow checks availability | Artifact present; exact Android/OEM behavior still to test |
| `INTERNET` | Network capability from framework/dependencies | Present; cannot claim no internet access |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | Network state capability; NetInfo dependency | Present; no Play collection call identified |
| `MODIFY_AUDIO_SETTINGS`, `WAKE_LOCK`, `VIBRATE` | Platform/audio capability | Present; dependency/runtime use needs traffic/lifecycle observation |
| Package-scoped `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Signature-level generated receiver restriction | Present; not a public data endpoint |
| Camera, broad media/storage, contacts, location, advertising-ID permissions | Not in the decoded APK permission list | Absent from these APKs; picker intent queries are not permissions |

Application: `allowBackup=false`, `usesCleartextTraffic=false`; Android full backup,
cloud backup and device-transfer XML each exclude `root`, `file`, `database`,
`sharedpref` and `external`, path `.`. This establishes packaged intent, not every
manufacturer's transfer behavior. App sandbox data is not asserted to have
additional app-level encryption. TLS policy is not proof of all vendor processing.

Device capture service and consent activity are not exported. MainActivity is
exported for launch and `exp+stimmyz-play`; no app share-receiver/import intent
was identified. File/image providers are non-exported with URI grants.
ProfileInstallReceiver is exported but protected by `android.permission.DUMP`.

## Data-flow inventory

All local rows below are `VERIFIED_FROM_CODE`; statements about successful cleanup
on a physical device and complete absence of off-device traffic remain
`UNKNOWN/REQUIRES_TEST`. App-private means the Android app sandbox/system can
access it; it does not promise protection from every device compromise.

| ID / origin and purpose | Storage, retention and deletion | Access / off-device handling | Evidence |
| --- | --- | --- | --- |
| F01 — User picks audio/video to create a sound | DocumentPicker cache copy then owned `Paths.cache/soundboard-editor-<UUID>` source and PCM/trim preview. Source max 5 min/32 MiB, retained PCM bounded. Normal dispose/error removes owned cache; startup cleanup removes recognized abandoned editor directories. User's provider original stays intact. | App/selected OS provider; no app upload call found. Provider may itself be cloud-backed. | `app-play/src/media/localAudio.ts:227-355,358-417,471-483`; `src/media/cacheMaintenance.ts:28-35` |
| F02 — User initiates microphone recording | Expo cache recording, foreground-only; 5 min/32 MiB bound; stop feeds editor. Cancel/error removes recognized cache URI. Saved trim becomes F04. Process-death/OS cleanup timing is not a guaranteed deadline. | App/audio subsystem after contextual permission; no network recipient identified. | `src/media/recording.ts:114-124,144-204,210-301` |
| F03 — User initiates permitted device playback capture | Native app-cache WAV, max 120 sec/32 MiB; copied to editor then released. Cancel/failure/no usable sound deletes output. Native stale-cache sweep targets non-active files older than 24 h; ready results are removed on process restart. | Android MediaProjection + AudioRecord; compatible playback audio only, no screenshot pipeline found. Private foreground service with notification Stop. | `src/media/deviceAudioCapture.ts:90-129,178-182`; `play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioConsentActivity.kt:25-83`, `DeviceAudioCaptureService.kt:108-150,191-222`, `CaptureStatus.kt:102-138` |
| F04 — User durably saves a trim for Library/board playback | `Paths.document/play-library/<clip UUID>.wav` for newly rendered trims; imported legacy MP3/M4A/AAC supported. Catalog stores chosen title, duration, UUID and creation time. Persist until deletion/uninstall, subject to external copies and platform behavior. | Private app files; identifiers are local content references, not an analytics identity. Playback decodes on device. | `src/media/localAudio.ts:420-468`; `src/data/library.ts:37-39`; `src/data/snapshot.ts:3-5` |
| F05 — Board/settings/playback metadata | `boards.json`, `catalog.json`, `preferences.json` v5, `presentation.json`, `clip-playback.json`, plus recovery snapshots/journal. Names, artwork metadata, ordering, layouts, theme, gain/repeat/volume. Local historical recovery copies can retain earlier metadata until replaced. | App-private, user copies via F08. No account, cloud-sync or sign-in flow identified in app composition/UI. | `src/data/snapshot.ts:3-29,95-116,165-195`; `src/data/preferences.ts:7-32`; `app-play/App.tsx` |
| F06 — User selects gallery artwork | Picker metadata is processed locally into center-cropped JPEG <=512 px and <=1 MiB; draft cache then private `play-library/artwork/`. A sanitized title derived from the selected filename is retained in artwork metadata and exported in backups. Replacement/unreferenced images pruned. Re-encoding does not by itself establish an EXIF-stripping guarantee; inspect output before promising it. | App/selected photo provider. No remote artwork picker/request found. Legacy local Imgflip title/source ID/source URL can still be read and exported; URLs are validated but not fetched. | `src/ui/ArtworkPicker.tsx:5-35`; `src/media/artwork.ts:27-118,129-148`; `src/data/presentation.ts:14-55` |
| F07 — User removes assignment or deletes Library sound | Removing assignment preserves the sound. Library delete commits catalog/boards/artwork/playback changes, aligns recovery snapshots, then deletes owned audio and unreferenced art. Interrupted deletion rolls forward through journal. External originals/exports remain outside this operation. | Local app/filesystem. Failures preserve recovery state; do not promise instantaneous secure erasure. | `src/data/library.ts:207-234`; `src/data/snapshot.ts:72-89,95-116` |
| F08 — User exports a ZIP backup | Archive includes audio, referenced artwork, titles/UUIDs/provenance, boards and playback/app preferences. Temporary ZIP in app cache; copied to chosen SAF destination; cache cleanup best effort. Exported copy remains until user/provider deletes it and may survive uninstall. | Chosen Android document provider, potentially cloud storage; explicit user-directed transfer. Not an automatic Stimmyz backend upload. Archive has no password/encryption layer identified in the writer. | `src/ui/SettingsModal.tsx:50-59,140-145`; `src/media/backup.ts:260-369` |
| F09 — User restores ZIP or imports old-app shared folder | Picker/cache stage with size/name/schema/header/checksum checks; merge by stable clip IDs; duplicates skipped; transactional commit/rollback. Restore can replace app preferences. Stages cleaned in finally; process-death/corruption coverage remains partial. | Selected document provider/shared folder → private app storage; source copies preserved. | `src/media/backup.ts:389-592`; `src/media/backupMerge.ts:16-37`; `src/media/soundbiteTransfer.ts:20-53`; shared `app-client/src/transfer/folderTransfer.ts:252-287` |
| F10 — Native capture state and diagnostic errors | App-private `device_audio_capture` SharedPreferences stores state, error, stop reason and ready-file URI/duration/audio statistics. Failed/cancelled status can remain until later state change. Errors also shown in app UI; no source log/upload sink found. | Local app/system. No analytics or crash-report destination identified. Native/third-party/OS logging still requires release runtime inspection. | `.../deviceaudio/CaptureStatus.kt:9,149-178`; `SoundboardDeviceAudioModule.kt:91-99`; Settings and creation error handlers |
| F11 — User chooses Report a problem | Android Share sheet opens a fixed editable problem-report prompt. No automatic media, filenames, diagnostics, address or configured recipient. If user sends, content/retention is governed by chosen destination. | User-selected external app/recipient; actual support inbox practice is not established by the share action. | `src/ui/SettingsModal.tsx:62-70,207-209` |
| F12 — Planned optional usage analytics | No implemented consent store, analytics queue or analytics ID found in current Play source. Existing preference schema has no consent. Owner approves future pseudonymous return measurement; project/config/event copy/retention remain unverified. | Handoff-proposed EU PostHog; not present as current shipped behavior. No live project was connected or tested. | `app-play/package.json`; `src/data/preferences.ts:7-32`; handoff and owner answer, 28 Oct |

Cache cleanup is deliberately bounded and best effort (e.g. enumeration limit
2,048 entries in `src/media/cacheMaintenance.ts:6-15`); source does not support a
promise that every temporary file disappears immediately or on a fixed schedule.
Startup invokes cleanup before library initialization (`app-play/App.tsx:58`).

### Website and correspondence flows

| ID / data and purpose | Location / recipients / retention | Evidence and status |
| --- | --- | --- |
| F13 — Website request metadata to deliver public pages/assets | Public host can receive IP, user agent, URL and request time. Actual host account, log fields, retention, staff access, region and transfers unknown. Local nginx alternative sends access/error logs to stdout/stderr; its settings do not establish Vercel practice. | `VERIFIED_PUBLIC_RESPONSE`: live policy returns 200 with `Server: Vercel`, HSTS and cache HIT. `website/nginx.conf:9-10`; host settings `UNKNOWN/REQUIRES_TEST`. |
| F14 — Website interactions/resources | Local Astro static HTML/CSS/assets. Home JS changes local theme images/menu; no form, analytics tag, external embed/font or script-owned cookie/storage API found. A single response without Set-Cookie is not a full browser storage/network audit. | `VERIFIED_FROM_CODE`: `website/astro.config.mjs:3-7`, `src/scripts/site.js:1-54`, `src/layouts/SiteLayout.astro`. Public privacy HTML matches built output byte-for-byte and declares only same-origin resources. |
| F15 — Support/privacy correspondence sent by users | Mail sender supplies address, message and any chosen attachments. Public MX points to Cloudflare routing. Forward destination, mailbox operator, access, support retention, deletion process and transfers remain unknown owner/account facts. | `USER_CONFIRMED`: inbound messages work; replies untested. `VERIFIED_PUBLIC_RESPONSE`: CF MX/SPF, a Brevo verification TXT and DMARC `p=none` with Brevo reporting destination. This does not prove outbound setup, vendor account terms or mailbox delivery. No mail was sent. |

## Live policy and in-app disclosure

`VERIFIED_PUBLIC_RESPONSE`: `https://stimmyz.vercel.app/privacy/` returned 200
without login on 28 October 2026. Saved HTML is byte-for-byte equal to
`website/dist/privacy/index.html`. Snapshot SHA-256:
`c98825a0e6a19d604db423ee7c8412e5f87cf6a5ed4476c6bc1e2b0d063bcc25`.
See [snapshot](evidence/live-policy.html),
[HTTP evidence](evidence/live-policy-http.json) and
[content checks](evidence/live-policy-summary.json).

The page still contains:

- Legal-name placeholder and public-contact placeholders.
- Draft date 25 October 2026, no actual effective date, and a visible do-not-submit
  notice. `noindex, nofollow` is in HTML metadata, not an X-Robots-Tag header.
- An explicitly provisional no-analytics assumption, backup statements awaiting
  verification, blended purposes/legal bases and unresolved host practices.

Source: `website/src/pages/privacy/index.astro:24,45-60,80-84,143-145,195-204,258-267`;
robots metadata: `website/src/layouts/SiteLayout.astro:31`.
No application policy URL or monitored recipient is configured in Settings;
the expandable local notice is `app-play/src/ui/SettingsModal.tsx:200-209`.

Initial web-tool/sandbox DNS attempts failed. An approved read-only request
outside the restriction succeeded; do not interpret earlier failures as downtime.
No host-account settings, worldwide accessibility or full browser execution was
verified. Public DNS records are retained without the domain-verification value
in [DNS summary](evidence/public-dns-summary.json).

## Owner answers and release interpretation

`USER_CONFIRMED`, 28 October 2026:

- Publisher is an individual. Public legal/controller name not supplied; private
  entry was explained as owner-filling during review, not a substitute identity.
- Incoming domain email works; branded replies untested.
- Initial audience answer was "everyone"; owner later clarified a general-purpose
  soundboard with no particular audience targeted, users creating their own value,
  and possible child downloads. This clarifies intent without establishing a
  child-directed design or selecting Console age groups. Actual design/listing
  review and appropriate declarations remain pending; no age restriction was approved.
- Support handler/retention undecided.
- Future random installation ID for return measurement approved in response to
  the question explicitly offering that ID for day 1/7/30 returns versus aggregate-only
  events. This does not approve a particular SDK/version, event payload, retention
  period or live activation. EU PostHog is the handoff proposal; actual vendor
  project/configuration and its suitability still require review.

Current artifact has no account creation flow identified: app-account deletion
path is provisionally `NOT_APPLICABLE` for this scope; local media deletion and
support/hosting data still need truthful disclosures. No ads/purchases/billing,
cloud sync or remote artwork request feature was identified in inspected source,
resolved graph and known-family scans. Reopen if scope or SDKs change.

Do not submit a definitive "no data collected" declaration from these scans.
Google defines app collection around off-device transmission and includes SDK
handling; user-directed export/provider behavior needs the applicable exceptions
and definitions assessed. Future consent-gated analytics must be assessed again.
See [Google Data safety](https://support.google.com/googleplay/android-developer/answer/10787469).
Google's [User Data policy](https://support.google.com/googleplay/android-developer/answer/10144311)
requires accurate disclosure, including third-party code. Its
[account deletion guidance](https://support.google.com/googleplay/android-developer/answer/13327111)
ties app-account deletion requirements to account creation.

"Everyone" is not a complete target-audience decision. Google's
[audience guidance](https://support.google.com/googleplay/android-developer/answer/9867159)
requires Families review when targeted groups include children; older minors may
also count as children in some locales. This audit makes no legal-basis or
children's analytics compliance determination. Official GDPR links were attempted
but blocked by the source site's JavaScript challenge; no unverified quotation
or article-level conclusion is supplied here.

## Verification and remaining empirical evidence

This pass:

- `node --experimental-strip-types --test --test-reporter=spec` in `app-play`:
  206 passed, 0 failed.
- `node --test scripts/verify-play-stage.test.mjs scripts/play-release-plugin.test.cjs`:
  14 passed, 0 failed.
- `node node_modules/typescript/bin/tsc --noEmit -p app-play/tsconfig.json`:
  exit 0.
- `scripts/build-play-android.ps1 -StageOnly -StagePath data/privacy-audit-stage-20261028`:
  passed, 105 files / 64 source files.
- Offline artifact helper was delegated, reviewed and rerun; it decodes APK binary
  manifest/resources, compares payload hashes and reports known namespace hits.
  [Helper](evidence/inspect-artifacts.mjs), [results](evidence/artifact-inspection.txt).
  It uses built-in Node filesystem/zlib/crypto only. It is an inspection utility,
  not a hardened untrusted-archive validator or a runtime privacy test.

An initial attempt to verify the retained stage directly hit its newly added
`artifacts/` output (outside the source allowlist); the clean StageOnly invocation
above passed. This is a verifier input-scope distinction, not a failing source
boundary. No test failure was hidden by treating build outputs as source.

The Docker engine was stopped/unreachable, so no fresh native build/resolution
was run. ADB was available after sandbox escalation, but reported **zero attached
devices**. No app install/data clear, device settings change or traffic capture
was performed. Historical r3/r4/phone records remain historical, not newly run
checks. Native unit/device tests and a full browser runtime network/storage trace
were not rerun. See [verification summary](evidence/verification-summary.json).

Still required: candidate traffic with synthetic media across cold start, idle,
record/import/trim/save/play, artwork, export/restore and failures; cleanup and
deletion/process-death/device-transfer proof; installed/Play-distributed build
identity; host/mailbox/vendor settings; owner answers and reviewed public wording.
