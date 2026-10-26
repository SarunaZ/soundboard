# Evaluation handoff — Stimmyz Android all-sources candidate

**Prepared:** 25 October 2026  
**Purpose:** Give an independent evaluator the current evidence, implementation map, limits, and specific review tasks. This is an evaluation brief, not a release approval.

## Executive status

- The owner-approved final feature scope requires three source paths in one Play app: local file import, foreground microphone recording, and Android device-playback capture.
- The finalized working tree enables all three by default. Device capture is omitted only by an explicit diagnostic-disable option.
- The r4 unsigned APK/AAB build passed dual-ABI packaging and capture-manifest checks. A locally test-key-signed APK copy also passed bounded phone checks on one Samsung Galaxy S24 Ultra.
- Bounded checks covered import/editor, microphone, board state, playback controls, device-capture consent, synthetic capture, notification Stop, empty/no-usable input handling, backup restore after a journal fix, and cleanup.
- The source tree remains dirty and no commit was made. The r4 build used 104 staged source inputs; afterward, `app-play/README.md` received a documentation-only scope clarification. Do not claim the current tree was freshly hash-matched against all r4 stage inputs.
- This evidence does not establish broad device compatibility, a physical 16 KiB-page device, Play-distributed installation, signed AAB update/rollback, Play-policy approval, or production readiness.

## Required evaluation boundary

Evaluate the r4 all-sources candidate against the owner's three-source requirement. Do not suggest removing device capture from the default product scope; the owner explicitly resolved that requirement. Evaluate implementation correctness and remaining release gates independently.

Keep these artifact states distinct:

- **r3:** historical capture-off APK/AAB. It is the first installed test copy and is not the final feature-scope candidate.
- **r4:** capture-enabled unsigned APK/AAB; this is the current candidate build. Physical checks used a local test-key-signed copy of the r4 APK, not a Play-signed or Play-distributed artifact.
- **Current workspace:** dirty, no commit or tag. The exact r4 package provenance is recorded in the local reports below. Subsequent report/README edits are documentation-only; application source remained frozen after r4.

## Candidate identity and artifacts

| Item | Recorded value |
| --- | --- |
| Source HEAD | `6e17e875d95714ce6b078935be8c1047b5e8e265`, dirty working tree |
| App version / Android versionCode | `1.0.28` / `29` |
| Android SDK / ABIs | minSdk 24; compileSdk/targetSdk 36; `arm64-v8a` and `x86_64` |
| r4 APK | [`data/play-readiness-all-sources-20261025-r4/artifacts/soundboard-play-testing-capture-unsigned.apk`](../../data/play-readiness-all-sources-20261025-r4/artifacts/soundboard-play-testing-capture-unsigned.apk), 49,711,893 bytes; SHA-256 `448b3885d8a7c941f8dc46c003bf40fe97d479143f5468082a867a6b0254a9cf` |
| r4 AAB | [`data/play-readiness-all-sources-20261025-r4/artifacts/soundboard-play-unsigned.aab`](../../data/play-readiness-all-sources-20261025-r4/artifacts/soundboard-play-unsigned.aab), 37,957,212 bytes; SHA-256 `6bc8ca3707d148e60ed7f6b90d5581ed086967f21cb33bbc650b36189bfe129c` |
| r4 capture configuration | `projectionCaptureEnabled=true`; capture foreground-service and projection service/activity present in the merged package |
| Local phone-test APK | [`data/phone-readiness-20261025-r4/stimmyz-1.0.28-all-sources-testing.apk`](../../data/phone-readiness-20261025-r4/stimmyz-1.0.28-all-sources-testing.apk), SHA-256 `53755e303686254a97dc1b920653b60c7588429c049cac40c1788f54a83373c4`; locally test-key signed, not Play App Signing |
| Build and package evidence | [r4 build log](../../data/play-readiness-all-sources-build-20261025-r4.log), [r4 artifacts](../../data/play-readiness-all-sources-20261025-r4/artifacts/), and [primary verification](../../data/play-readiness-all-sources-primary-verification-20261025.log) |

The r4 APK and AAB each contain 44 native ELF libraries. The recorded ELF page-alignment checks passed; APK zipalign passed. Sixteen packaged FFmpeg library instances matched validated build outputs. These are artifact checks; a physical 16 KiB-page device was not tested.

## Implementation map

| Area | Source pointers | What to inspect |
| --- | --- | --- |
| Default feature/build configuration | [`app-play/app.config.js`](../../app-play/app.config.js); [`scripts/build-play-android.ps1`](../../scripts/build-play-android.ps1) | Device capture defaults on; only an explicit diagnostic false disables the capture plugin. Build script checks the configured permissions/components and package outputs. |
| Source actions and creation lifecycle | [`app-play/src/ui/CreateFlow.tsx`](../../app-play/src/ui/CreateFlow.tsx); [`app-play/src/ui/EditorScreen.tsx`](../../app-play/src/ui/EditorScreen.tsx); [`app-play/src/ui/BoardScreen.tsx`](../../app-play/src/ui/BoardScreen.tsx) | All three entry actions feed the shared Source → Trim → Details → Save flow; inspect permission cancellation, lifecycle transitions, invalid/quiet audio and discard cleanup. |
| Local audio import/decode | [`app-play/src/media/localAudio.ts`](../../app-play/src/media/localAudio.ts); [`app-play/src/media/recording.ts`](../../app-play/src/media/recording.ts) | SAF staging, format/size/duration limits, source ownership, microphone capture path, PCM decode and temporary-file cleanup. |
| Device playback capture controller | [`app-play/src/media/deviceAudioCapture.ts`](../../app-play/src/media/deviceAudioCapture.ts); [`app-play/plugins/withDeviceAudioCapture.js`](../../app-play/plugins/withDeviceAudioCapture.js) | Consent/session control, capture status/stop handling, build-time manifest wiring, and error recovery. |
| Android capture service/native bridge | [`app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioCaptureService.kt`](../../app-play/play-native-modules/soundboard-device-audio/android/src/main/java/dev/sarunas/soundboard/deviceaudio/DeviceAudioCaptureService.kt); `DeviceAudioConsentActivity.kt`; `SoundboardDeviceAudioModule.kt` in the same directory | Projection consent, foreground-service lifecycle/notification Stop, bounded output and cleanup. The module uses Android playback-capture APIs; it does not imply every app permits capture. |
| Library transactions/restore | [`app-play/src/data/snapshot.ts`](../../app-play/src/data/snapshot.ts); [`app-play/src/data/library.ts`](../../app-play/src/data/library.ts); [`app-play/src/media/backup.ts`](../../app-play/src/media/backup.ts) | `writeSnapshotTransaction` journal staging, atomic moves, backup validation/merge, recovery behavior and post-failure source-file ownership. |

Other implemented work to evaluate:

- Multi-board create, rename, reorder and confirmed deletion; at least one board remains, and deleting a board retains Library media. Inspect [`boards.ts`](../../app-play/src/data/boards.ts) and `BoardScreen.tsx`.
- Playback cancellation, audio focus/lifecycle handling and bounded cold decoding. Inspect [`playbackEngine.ts`](../../app-play/src/media/playbackEngine.ts): at most two concurrent cold decodes, queued cancellation, idle focus release and background stop behavior.
- Import limits: source up to five minutes/32 MiB, trim up to 60 seconds, aggregate retained PCM budget 128 MiB across at most two drafts. Cancellation retains decoder occupancy until native work settles; replacement preserves the prior source until success.
- Versioned snapshots, pending-write recovery, journal roll-forward and conservative orphan/cache cleanup. ZIP restore validates paths, checksums/schema and resource bounds; artwork deduplicates. Fully corrupt current metadata still fails closed and preserves media; a manual support/export recovery route remains open.
- Play-source isolation excludes the extractor/backend flow. Artwork is gallery-only; GIPHY/Imgflip browsing was removed. Privacy/help and searchable offline notices were added. Source/build gates cover immutable dependency installs, TypeScript, tests and release packaging; no remote CI run or deployment is claimed.

## Automated evidence

- **App suite:** 200 passed, 0 failed. Log: [`play-readiness-all-sources-tests-20261025.log`](../../data/play-readiness-all-sources-tests-20261025.log).
- **Strict TypeScript:** passed. Log: [`play-readiness-all-sources-typescript-20261025.log`](../../data/play-readiness-all-sources-typescript-20261025.log).
- **Security/configuration suite:** 31 passed. Log: [`play-readiness-all-sources-security-tests-20261025.log`](../../data/play-readiness-all-sources-security-tests-20261025.log).
- **Restore regression:** targeted fake-filesystem regression suite passed 27/27. The fake filesystem models Expo's same-URI `File.moveSync` behavior.
- **What this does not establish:** complete app behavior on all devices, Android system integration on every supported API/OEM, or Play-distributed behavior.

Use the 200/31/TSC results above as the current all-sources gate. Earlier 199-test and 13-test records are historical, superseded runs.

## Physical phone evidence

The completed bounded phone run used a Samsung Galaxy S24 Ultra (`SM-S928B`), Android 16/API 36, 4,096-byte page size. It installed r3 first, then updated in place to r4 with `adb install -r`; the update preserved the app UID and prior Library/board state. The phone QA record is [`PHONE_QA-2026-10-25.md`](PHONE_QA-2026-10-25.md).

**Verified on r3/r4 as stated in the phone record:**

- SAF import/editor: synthetic WAV import/trim/save and M4A/AAC import through SAF opening Trim. The M4A/AAC sample was 0.37 seconds; malformed/empty coverage through the app was not comprehensive.
- Foreground microphone: one 13.46-second capture was stopped, trimmed to 6.06 seconds, and saved. The user confirmed the spoken test phrase clear in preview. This is one quality sample, not an OEM/interruption matrix.
- Board/grid and playback: a QA board's grid/order persisted over force-stop/relaunch; loop persisted; Stop and Home stopped playback; returning did not autoplay. An initial low-volume preview was inaudible; at volume 6/15 the user confirmed audibility.
- Empty input: Android picker selection of a synthetic empty WAV showed an actionable “unknown or empty size” error and saved no broken clip.
- Upgrade preservation: in-place r3 then r4 update retained the app UID, 12 original Library sounds, two original boards and theme.
- Projection cancellation: all three source actions were visible. Canceling Android projection consent left no active projection and saved nothing.
- Device capture: a controlled, permission-free local fixture generated synthetic tones, and Android's single-app chooser selected only that fixture. During capture, the app projection and foreground service were active. The first session ended at the two-minute hard limit while the notification was being inspected; that session does **not** prove notification Stop.
- Captured audio: its six-second trim was saved to the QA Library, and the user confirmed the captured ringtone tones audible in preview.
- Notification Stop: separately verified in a fresh session. The parent pressed Android's expanded notification Stop; the app projection became null. The returned Source screen showed “No usable audio was captured; source may be silent or restrict playback capture” and saved no silent clip. The fixture playback-capture policy was explicitly `NONE` (`none-policy-set.xml`).
- Restore fix: initial r3 restore did not restore the deleted synthetic AAC QA clip/board. Root cause was `writeSnapshotTransaction` reusing a cached Expo `File` after `moveSync` mutated its URI; the next transaction attempted to move the journal path itself. The fix creates a fresh journal-staging `File` per transaction. The same backup restored the deleted QA AAC clip and board on r4; a subsequent transaction deleted the mic QA clip successfully.
- Cleanup: original 12 Library sounds and two original boards remain; volume was restored to 0; QA clips/board, fixture app, synthetic Downloads inputs, local backup and device temp probe files were removed. Final state reported no active projection, capture service or AudioTrack for the app UID.

Evidence screenshots/XML/logs and the final state summary are stored in ignored local data folders, especially [`data/phone-readiness-20261025-r4/final-state-summary.log`](../../data/phone-readiness-20261025-r4/final-state-summary.log). Those local evidence files may not accompany a Markdown handoff or source archive.

## Dependency and security qualifications

- **JavaScript dependencies:** the final isolated graph passed its strict gate and compatibility/security tests. The raw audit still reports one high `node-forge@1.4.0` advisory (GHSA-86w9-cpqp-85rv). A local patch rejects unconsumed nested `DigestAlgorithm` elements and passed exact patch/hash and regression checks. Treat this as a narrow local mitigation, not an upstream fixed version and not a zero-finding raw audit. See [`DEPENDENCY_AUDIT-2026-10-25.md`](DEPENDENCY_AUDIT-2026-10-25.md).
- **Android Maven graph:** the retained OSV batch covered 160 coordinates and returned zero affected-version results for the scanned graph. r4's selected Maven versions were compared locally and match those 160 versions exactly; no fresh r4 OSV query ran. The attempted request was rejected by automatic approval review because it would send destination-specific package metadata without explicit authorization. See [`native-maven-r4-retained-audit-comparison-20261025.log`](../../data/native-maven-r4-retained-audit-comparison-20261025.log).
- **Native FFmpeg:** a separate FFmpeg 8.0.3 source build and standalone x86_64/arm64 probes passed for the recorded synthetic fixtures. The probes are not proof the installed app loaded those exact native decoders for the tested import flows. The r4 package hashes/alignment checks are separate artifact evidence.
- **Licensing:** 479 searchable notice records are packaged; 43 are metadata-only. Maven/native attribution and license review remain open. Do not treat an OSV result or bundled notice data as legal clearance.
- **Network/privacy:** no final proxy/network trace of the all-sources r4 release flow or final Data safety declaration is recorded. Capture and microphone disclosures, purpose, consent, retention/storage and foreground-service policy still require owner review against the exact submission artifact.

## Open release gates

1. Broader supported-device/API coverage, including Pixel/lower-end devices, calls/interruption, Bluetooth/wired routing, and a physical 16 KiB-page device.
2. Capture compatibility across source apps and lifecycle conditions; the synthetic fixture proves the exercised path only. No claim is made that every source app permits capture.
3. A signed AAB through the approved Play App Signing path, plus Play-distributed install/update/rollback and pre-launch testing.
4. Final permission/policy declarations, Data safety, public privacy policy URL/support contact, store listing screenshots, rights and license attribution, user-study/accessibility review, and closed-testing gates.
5. Broader backup/migration/error-recovery matrix. The specific r4 restore retry passed after the journal fix; schema/version and partial/corrupt-backup cases remain outside this phone check.
6. App release profiling, crash/ANR review, physical playback routing and latency/resource evidence.

The current [`ANDROID_PRODUCTION_READINESS.md`](ANDROID_PRODUCTION_READINESS.md) tracker is a 142-item copy of the original `Stimmyz_Android_Production_Readiness.md` source from Downloads. It retains the original checklist items and current evidence/status; this handoff does not replace it.

Keep all 142 items intact when proposing status updates; distinguish an unmet gate from an item that is out of scope or already verified.

## Evidence sources and caveats

- [`PHONE_QA-2026-10-25.md`](PHONE_QA-2026-10-25.md) is the dated record for Samsung r3/r4 flows, the initial restore failure, the r4 restore retry, the synthetic capture tests, and verified cleanup.
- [`VERIFICATION-2026-10-25.md`](VERIFICATION-2026-10-25.md) is the build, package, source-test and release-gate snapshot; r3 and r4 artifacts are listed separately.
- [`ANDROID_PRODUCTION_READINESS.md`](ANDROID_PRODUCTION_READINESS.md) retains the full 142-item source checklist and current status/evidence.
- [`DEPENDENCY_AUDIT-2026-10-25.md`](DEPENDENCY_AUDIT-2026-10-25.md) documents the JS graph, raw node-forge advisory and exact local mitigation boundary.
- [`NATIVE_DEPENDENCY_AUDIT-2026-10-25.md`](NATIVE_DEPENDENCY_AUDIT-2026-10-25.md) documents the FFmpeg native build/probes, Maven graph findings, OSV coverage and licensing limits.
- [`release-runbook.md`](release-runbook.md) carries candidate identity, artifact hashes, build and release workflow fields.
- [`qa-matrix.md`](qa-matrix.md) marks the r3/r4 device rows separately and retains broader device classes as open.
- Many linked logs, screenshots and manifests are under ignored local `data/` folders. An evaluator receiving only this Markdown may not be able to open them; report this evidence-access limit instead of assuming a missing file passed or failed.

## Prioritized evaluator sequence

1. Confirm the owner-approved source scope is still all three sources and verify the r4 config defaults to enabled capture. Consider the diagnostic-disable path separately from the required default.
2. Reconcile r4 `release-info.txt`, APK/AAB hashes, merged manifest, permissions, capture components, and package alignment/hash reports. Record that the r4 build is unsigned.
3. Trace file, microphone and device-capture UI paths through `CreateFlow.tsx`, their media controllers and the local library. Inspect cancellation, trim/save, discard and cleanup ownership.
4. Review the native capture service's MediaProjection/foreground notification lifecycle. Match the r4 manifest declarations to observed consent, cancellation, duration-stop and notification-stop behavior.
5. Review the r3 restore failure and r4 retry as a single regression story. Inspect `writeSnapshotTransaction`, the fresh staging `File`, and the fake move-semantics test; identify untested transaction failure points.
6. Compare claimed phone results to `PHONE_QA-2026-10-25.md`. Keep the 120-second hard-limit session separate from the fresh notification Stop session.
7. Assess JS and Maven/native security evidence independently. Preserve raw finding counts and state exactly where the local node-forge patch applies.
8. Prioritize remaining device and policy gates: 16 KiB-page hardware, other OEM/API classes, calls/routing, capture-compatible source apps, signed AAB distribution, Play Console declarations and legal/privacy review.
9. Note any evidence blocked by ignored local data, any mismatch between files and records, and any test result that could not be reproduced.
10. Return prioritized findings and status corrections; do not change the 142-item tracker or code unless separately authorized.

## Requested evaluator output

Return findings by severity with file/line, observed evidence, impact, confidence and reproduction steps. Separate confirmed defects, missing coverage and policy/release blockers. Provide corrected status wording and a prioritized remaining-work list; state when evidence is unavailable.

Preserve existing user changes and media. Do not commit, push, publish or transmit local evidence/recordings. Treat this as a review request unless the owner separately authorizes implementation.
