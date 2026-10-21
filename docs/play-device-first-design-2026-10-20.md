# Device-first design update — 2026-10-20

The subsequent [soundbite transfer update](soundbite-transfer.md) builds on this
design at Play 1.0.18/code 19 and old-app 1.0.4/code 5. This record retains the
design-specific 1.0.17 verification history.

## Source and scope

Imported `StimmyzApp_Astra_Design_Refined_CTA_Library_2026-10-20.zip` from the
owner's Downloads into
[`design/StimmyzApp_Astra_Design_Refined_CTA_Library_2026-10-20/`](design/StimmyzApp_Astra_Design_Refined_CTA_Library_2026-10-20/README.md).
The package's source contract, prototype and previews supersede the October 18
source hierarchy and Library icon. Its copied device-capture results are a
historical reference; the root `DEVICE_AUDIO_CAPTURE_RESULTS.md` remains the
repository's native capture evidence.

This updates the existing Expo / React Native Play app and uses its established
Android MediaProjection capture controller and service. The Dev app, capture
permissions, native capture implementation, six palettes and saved media are
outside this change. No demo image or audio from the design package is bundled
into the app.

## Implementation

- Editor features the device-recording hero, Start → Play moment → Stop & trim
  sequence, centered text-only capture action and compatibility note, followed
  by smaller microphone and import cards.
- Library features the centered text-only recording action and the stacked
  collection/play icon shared with its 29 dp navigation tab. More ways to add a
  sound opens the full source chooser.
- Quick add remains the first grid action. New eligible Android users default
  to device recording; unsupported platforms default to local import. Existing
  saved preferences migrate without changing their selected action. The four
  choices remain behind the Edit board-only arrow.
- Trim previews a rendered sample-bounded WAV through the installed Expo audio
  player. Native position events drive the waveform playhead, played tint,
  elapsed time and progress bar. Pause/resume, completion/replay, selection
  changes and route/background cleanup are handled separately from rendering
  and saving. Optional Loop and waveform seeking are deferred.

Implementation was delegated to two bounded `gpt-6-luna` workers at high
reasoning effort. The parent performs integration review and verification.

## Verification

- All 87 Play data/media/layout/controller tests pass. The eight new preview
  controller tests cover player position, buffering, pause/resume, replay,
  reset, errors and stale-listener disposal.
- Strict Play TypeScript passes. All 11 stage/release-plugin tests pass.
- ARM64 + x86_64 release APK/AAB build passes, including source staging,
  device-audio-only autolinking, package/permission, backup/cleartext and
  extractor-marker audits. The Windows build script now normalizes its Bash
  here-string to LF before Docker receives it.
- Build version is **1.0.17 / code 18**, package
  `dev.sarunas.soundboard.play`. The unsigned testing APK is 65,874,926 bytes,
  SHA-256 `9bdb67742e7394aebe4dd5795d202f2eaa221a566173d602a580907787a478cb`.
  Artifacts are under
  [`data/play-device-first-build-20261020-final/artifacts/`](../data/play-device-first-build-20261020-final/artifacts/).
- The first signing/install attempt was blocked before execution because the
  automatic approval reviewer hit its usage limit. Following the owner's
  installation request, a new attempt succeeded: **1.0.17 / code 18** is now
  installed with `adb install -r` and launched on **emulator-5554**. Its v2/v3
  signature uses the existing local testing certificate (SHA-256
  `b095e9fe2a6242050ef08117a90534e4629da9a35e0fdc095b04335dc32c020c`), and
  16 KiB ZIP alignment passes. The signed testing APK is
  [`data/play-device-first-qa-20261020/soundboard-play-testing-signed.apk`](../data/play-device-first-qa-20261020/soundboard-play-testing-signed.apk).
- Ice-theme native Editor and Library screenshots confirm the new hierarchy,
  text-only centered capture actions and collection/play icon. The saved
  microphone Quick add action and the existing `My recording` Library entry
  and pad assignment remained present after updating. Evidence is under
  [`data/play-device-first-qa-20261020/`](../data/play-device-first-qa-20261020/).
  Broader playback and visual matrix checks remain pending.
- At the owner's explicit request, the same signed **1.0.17 / code 18** APK
  was subsequently installed with `adb install -r` on the connected Samsung
  **SM-S928B** (`R5CWC206XDT`). Launch returned `Status: ok` (cold start 309 ms).
  User 0's data inode (`170828`) and first-install time (`2026-10-17 18:34:03`)
  were unchanged. No uninstall or app-data clear occurred; saved clip contents
  were not independently inspected on the phone.
- A subsequent installation request targeted the newly connected Samsung
  **SM-S911B** (`RFCWA17DAJW`). The Play package was absent before installation.
  The same **1.0.17 / code 18** APK installed successfully and cold-launched with
  `Status: ok` (870 ms). No uninstall or app-data clear occurred.

## Remaining acceptance

The new playback UI still requires physical-device listening for the complete
TP-01–TP-09 matrix, including marker audio outside selected bounds, audio focus,
Bluetooth and interruptions. Previous capture compatibility evidence does not
prove every source app or Android device works. No store release is implied.
Emulator screenshots for Vanilla/Coffee, all six palettes and 360 dp / 150%
font scale are also pending. The pre-existing nearest-handle gesture behavior
should be exercised with very narrow selections; closely overlapping handles
may be difficult to distinguish, and Fine tune remains available.
