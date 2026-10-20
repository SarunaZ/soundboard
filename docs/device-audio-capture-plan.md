# Device audio capture spike plan

Date: 2026-10-19
Branch: `feat-sound-recording`
Baseline: `b1376c9` (clean working tree before this planning task)
Status: implementation complete on this branch; build/emulator evidence and
remaining hardware gates are tracked in [the results report](../DEVICE_AUDIO_CAPTURE_RESULTS.md).
Source: [Astra handoff](device-audio-capture-handoff.md).

Owner testing sequence (2026-10-19): complete implementation and available
automated/emulator checks first. When that build is ready for hardware testing,
the owner will connect a Samsung Galaxy S24 Ultra. This supersedes the handoff's
physical-device-before-UI gate; hardware compatibility remains unverified until
those final tests actually run.

## Goal and scope

Add an optional **Record device audio** source to the current Play creation
flow. Capture permitted playback from another Android app, stop from an ongoing
notification, then reuse Source → Trim → Customize → Save → offline playback.
This is a feasibility spike, independent of the core launch.

Keep the current clean-rebuild UI, six themes, large bottom navigation icons,
pinned-first Quick Add, its edit-only configuration arrow, pad/Library menus,
and existing microphone/file behavior. Add the source to Editor and the general
creation Source screen; keep Quick Add's saved actions and preference schema as
they are for this spike. Do not change Dev, add extraction services, record
screen images/video, substitute microphone input, or introduce overlays.

## Repository audit

| Area | Current evidence and implication |
| --- | --- |
| App/framework | Target `app-play/`, package `dev.sarunas.soundboard.play`; Expo ~57.0.13, React Native 0.86.2, React 19.2.3. Dev remains in `app-client/`. |
| Android versions | The installed Play 1.0.15/code 16 reports **minSdk 24, targetSdk 36** on the API 36 emulator. No SDK override is declared in Play app config; verify generated Gradle/merged manifest in the new build. Retain minSdk 24, feature-gate capture at API 29. |
| Creation route | `App.tsx` owns creation and the captured board/pad target. `CreateFlow.tsx` owns source, trim, customize, cancellation and save. `InitialAction` currently supports `file` and `record`; `EditorScreen.tsx` starts those directly. |
| Microphone | `media/recording.ts` uses `expo-audio` and a one-shot controller. `CreateFlow.tsx` cancels it when AppState leaves active. That policy must remain specific to microphone; device capture must survive switching apps and projection-consent UI. |
| Preparation/trim | `media/localAudio.ts` exposes `openLocalAudioFile(File, signal, titleOverride, metadata)` → `LocalAudioSource { id, uri, title, durationMs, peaks }`. It stages an owned cache copy, probes duration, decodes with `react-native-audio-api`, computes waveform peaks, renders PCM16 WAV, and disposes owned sources. |
| Limits | Existing source cap: 5 minutes / 32 MiB; trim: 100 ms–60 seconds. Decoder uses shared 44.1 kHz PCM helpers and supports up to two channels. Device capture gets a stricter 120-second native limit plus the existing byte cap. |
| Storage/save | Play library/catalog/snapshot code commits private audio and metadata; board assignment can be retried without another clip commit. Reuse this contract; no capture-specific library migration is needed. |
| Permissions | Play already allows `RECORD_AUDIO`. `app.json` blocks `POST_NOTIFICATIONS` and overlays; Expo background recording/playback are disabled. Device capture needs its own mediaProjection service and notification policy, while Expo microphone background recording remains disabled. |
| Native/build boundary | `package.json` points autolinking at `./play-native-modules`, but the build script requires it to be empty. The stage verifier also requires emptiness, excludes every `android` directory, and lacks a native-module allowlist. Adding Kotlin alone cannot build. |
| Documentation drift | Some README/STEPS/design-plan passages still describe video as pending, while the current Editor advertises MP4/MOV and the root README describes support. Preserve existing behavior; verify video regression separately instead of assuming compatibility from those descriptions. |
| Available hardware | `adb devices -l` found only `emulator-5554` (`sdk_gphone64_x86_64`), API 36. No physical Samsung or other handset is currently connected. No capture or compatibility test was performed. |

Read for this audit: root AGENTS, README, STEPS and PLAN; Play README;
`docs/stimmyz-design-plan.md`; current clean-rebuild design authority and
implementation guide; relevant creation/media/config/staging source.

## Proposed architecture and behavior

1. Add a small Play-only Expo Android module, `soundboard-device-audio`, under
   `app-play/play-native-modules/`. It owns consent integration and bridges to a
   non-exported foreground service. Keep native capture independent of React
   component lifetime and JS timers. Use a stub/unavailable capability on other
   platforms or unsupported Android versions.
2. On an explicit source action, explain compatible-app limitations and that
   Android requires its audio permission even though this source does not use
   the microphone. Request `RECORD_AUDIO` if needed and fresh projection consent
   for every session. Start the mediaProjection foreground service after consent,
   enter foreground, then obtain the projection and configure playback capture.
   No reused consent Intent/token, boot receiver, sticky restart or auto-resume.
3. Use `AudioPlaybackCaptureConfiguration` + `AudioRecord` for permitted media,
   game and unknown usages. Stop Stimmyz preview playback and exclude its own
   UID. Do not select microphone input or take exclusive audio focus away from
   the source app. Register `MediaProjection.Callback.onStop()` before capture.
4. Stream PCM16 to an app-private temporary WAV on a native worker thread.
   Prefer supported 44.1 kHz mono for a small POC; validate initialization and
   actual sample format. If a device needs another rate, write correct metadata
   and prove existing decoder resampling before accepting that output. Finalize
   the WAV header from frames written, not wall-clock time. Enforce 120 seconds
   and 32 MiB natively, even while JS is suspended.
5. Use explicit `idle → requesting-permission → preparing → recording → stopping
   → ready | failed | cancelled` states, unique session IDs and serialized
   idempotent start/stop/cancel. The native service owns AudioRecord, projection,
   worker, file, timer and foreground-notification cleanup. Reject simultaneous
   microphone/device sessions and repeated/stale bridge results.
6. Provide notification Stop plus in-app Stop/Cancel. On API 33+, contextually
   request notification permission. **POC default:** do not begin when app/channel
   notifications are disabled, so the promised drawer Stop action is available;
   explain how to enable it and retain microphone/import alternatives. This is
   a product restriction, not an Android requirement for starting an FGS. If
   permission is revoked mid-session, stop safely; retain in-app/system stop and
   the native duration bound as backstops. Keep overlay permission blocked.
7. Notification Stop finalizes capture while the source app stays foreground.
   Retain a bounded native result and expose status/result retrieval on return;
   the notification content action can reopen Stimmyz. Do not automatically
   launch an activity from the background. Defer waveform decoding to foreground
   and adopt the result once into the original draft/assignment target. Component
   backgrounding must not discard device capture; explicit cancel/unmount that
   ends the flow must stop it and release ownership.
8. Validate frame count, WAV structure/duration, peak and RMS. Reject empty,
   invalid and all-zero output; flag near-silent output for explicit review or
   retry, without claiming the source definitely blocked capture. Calibrate the
   threshold using controlled audio. Never automatically commit a clip. Once
   `openLocalAudioFile` owns a staged source, delete only the native original.
9. Projection revocation, lock/interruption and errors terminate safely. Define
   each stop reason and whether a finalized valid partial recording can be
   reviewed; cancellation discards it. Process death does not restart recording
   or promise draft restoration. Sweep only this module's stale owned temporary
   files on next initialization, with bounds/TTL and active-session protection.
   Log only technical counters and levels, never source-app identity/content.

## File-level implementation plan

Proposed filenames may be adjusted to the installed Expo module conventions.

| Files | Planned change |
| --- | --- |
| `app-play/play-native-modules/soundboard-device-audio/{package.json,expo-module.config.json,android/build.gradle,android/src/main/AndroidManifest.xml}` | Android-only local Expo module registration, build configuration, non-exported mediaProjection service and exact required permissions. |
| Same module, `android/src/main/java/dev/sarunas/soundboard/deviceaudio/{SoundboardDeviceAudioModule.kt,DeviceAudioCaptureService.kt,PlaybackCaptureSession.kt,PcmWavWriter.kt}` | Consent/activity-result bridge, native session/status/result ownership, notification actions, streaming WAV writer, signal statistics, limits and cleanup. Separate pure state/file logic for JVM tests. |
| `app-play/src/media/deviceAudioCapture.ts` and focused tests | Typed capability/state/result adapter; bridge availability; cancellation/generation guards; foreground result adoption through `openLocalAudioFile`; delete native file after transfer. Keep `LocalAudioSource` and saved clip schema intact. |
| `app-play/src/ui/CreateFlow.tsx` | Add source choice and native-session status/stop/cancel; distinguish consent/background transitions from foreground-only mic interruption; consume notification completion once; preserve draft target and existing trim/customize/save behavior. |
| `app-play/src/ui/EditorScreen.tsx`; `app-play/App.tsx` only as needed | Add matching optional source action and extend `InitialAction` with a device-capture value; retain existing direct file/microphone actions and route. No board/Quick Add preference expansion. |
| `app-play/app.json`; new `app-play/plugins/withDeviceAudioCapture.js` and plugin tests | Remove the notification block for this source, declare notification/FGS/mediaProjection permissions and service through reproducible prebuild. Keep Expo background recording/playback off, backup disabled, storage restrictions and overlay block intact. Avoid duplicate service/permission declarations across module/plugin. |
| `app-play/package.json`; `yarn.lock` only if required | Verify module autolinking and Expo module runtime dependency requirements against the installed SDK; add only needed dependencies. No Dev module/dependency changes. |
| `scripts/build-play-android.ps1`, `scripts/verify-play-stage.mjs`, `scripts/verify-play-stage.test.mjs`, release/plugin tests | Replace the empty-directory rule with an exact module/file allowlist. Permit Android source only inside that module; retain denial of generated app Android trees, foreign modules, keys, environment files and extractor code. Inspect autolinking and merged APK/AAB permissions/services. |
| Native module JVM/instrumented tests; isolated `tools/device-audio-test-player/` fixture | Rights-cleared tone player with MEDIA usage and ALL/SYSTEM/NONE policy modes, separate package, never staged into Play. Test pure state/WAV behavior and real service lifecycle where feasible. Add bounded fixture build/run instructions. |
| `DEVICE_AUDIO_CAPTURE_RESULTS.md`; `docs/device-audio-capture-testing.md`; README/STEPS | Use the handoff's exact results sections, map AC-01–AC-13 to evidence, provide repeatable device matrix and report remaining gates. Update project status only to the level actually verified. |

## Execution order and gates

1. **Audit complete; plan ready for review.** Confirm the module boundary,
   existing editor contract and required permission changes described above.
   No application implementation is included in this planning task.
2. **Build/native feasibility.** Implement the narrowly allowlisted module,
   streaming writer, lifecycle core and controlled player fixture. Prove local
   WAV decoding and independent service Stop with available automated/emulator
   checks. Investigate controlled-source failures before proceeding. Hardware
   absence does not block completing the isolated feature on this branch;
   physical feasibility remains NOT TESTED.
3. **Connect and verify the product.** Add the two source entry
   actions; consent → background capture → notification Stop → return → existing
   Trim → optional artwork → one saved clip → board assignment/offline playback.
   Verify denied/cancelled/silent paths alongside the happy path. Complete the
   build, automated tests, artifact audits and available emulator regression
   checks, then report readiness and remaining hardware checks to the owner.
4. **Final Galaxy S24 Ultra validation.** The owner connects the handset once
   implementation and available checks are ready. First capture a controlled
   authorized tone and verify audible output, waveform, trim/save and offline
   playback. If the baseline fails, fix it before interpreting source-app results.
   On that same handset and authorized clip, compare native recorder Media
   sounds with this prototype. Record model,
   Android/One UI, build/target SDK, source-app versions, consent mode, route,
   duration, audible output and levels. Then exercise Chrome, Shorts, TikTok,
   Reels, local player/game and a second vendor if available. Report each actual
   result; native-recorder success does not establish third-party support.
5. **Decision.** Recommend optional rollout only after controlled physical
   capture, reliable end-to-end save, safe cleanup/failure UX and useful confirmed
   sources. Otherwise retain the isolated spike and report Further testing
   needed or No-go; core launch stays independent.

Implementation must be delegated to at least one `gpt-6-luna` worker with high
reasoning per AGENTS.md. Use bounded sequential ownership: native/build first,
then UI adapter/integration after available native checks. The primary agent reviews diffs,
state/ownership boundaries and evidence. No overlapping writers, automatic
commit/push or app restart. This planning-only task did not require a coding
worker.

## Verification plan

- Native state/file tests: consent denial produces no file/service; double
  start/stop/cancel, stale result, read/write failure, duration/byte limits, WAV
  headers and frame-derived duration, silence/quiet signal and cleanup.
- Bridge/integration tests: notification completion while JS is suspended,
  foreground reconciliation once, cancel during consent/preparation/stopping,
  exact file ownership transfer, preserved board/pad target and one save.
- Device lifecycle: notification Stop, system projection revocation, lock,
  rotation, process death, permission denial/revocation, disabled notification
  channel, repeated sessions, rapid taps, Bluetooth/headphones and route change.
  Include API 29 baseline and API 34+ / current target behavior where available.
- Regression: existing mic cancels on background; file/video import baseline,
  trim/Fine tune/preview, optional artwork, saved clip relaunch/offline playback,
  board assignment/retry, all six themes, Quick Add pinned first/edit-only arrow,
  pad/Library menus and Dev identity/data/permission boundary.
- Run Play tests and strict TypeScript using the Docker command in Play README;
  run stage/release-plugin tests, `scripts/build-play-android.ps1 -StageOnly`,
  then isolated APK/AAB build and native tests. Audit actual merged permissions,
  service export/type, SDK metadata, module autolinking and extractor absence.
  Existing historical test counts are not fresh results for this spike.
- Preserve AC-01–AC-13 and the handoff source matrix in the results report. Mark
  physical tests NOT TESTED until hardware evidence exists. Record failures as
  failures; do not infer policy restrictions when the controlled baseline fails.

## Current Android references checked for planning

- [Audio playback capture](https://developer.android.com/media/platform/av-capture):
  API 29+, RECORD_AUDIO and user consent, same profile, permitted usages and
  source capture policies. System capture can differ from third-party capture.
- [Media projection](https://developer.android.com/media/grow/media-projection):
  foreground-service declarations, fresh consent/token lifecycle and onStop
  cleanup. No virtual display/video pipeline is planned for this audio source.
- [Foreground-service types](https://developer.android.com/develop/background-work/services/fgs/service-types#media-projection):
  consent before service creation and projection acquisition after foreground
  service setup. Use mediaProjection, without microphone capture/service type.
- [Notification permission](https://developer.android.com/develop/ui/compose/notifications/notification-permission):
  denied notification permission can hide the drawer notification despite an
  active FGS; the proposed notification-availability gate addresses the Stop UX.

Recheck installed Expo APIs and generated native configuration when implementing.
Store-release review is separate from this optional feasibility spike.
