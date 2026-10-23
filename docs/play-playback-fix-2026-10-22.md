# Pad playback tail and startup delay — 2026-10-22

The owner reported that the end of a finished sound could be heard over the
next pad, and that some pad presses took 5–10 seconds to start. This change
targets the Play app's playback engine; saved audio files are unchanged.

## Findings and changes

The shared final WaveShaper used 4× oversampling. In the installed Audio API,
`AudioNode::onInputDisabled` disables downstream nodes when their last input
ends, while `WaveShaper::processResampled` retains its up/downsampler state.
That state can resume on the next source instead of draining during idle.
The final WaveShaper now uses its stateless, non-oversampled curve. Protected
PCM and conservative mix peak bounds retain their existing intersample margin.
This is source-level evidence of the tail mechanism; audible phone confirmation
is still pending.

Previously every boost above 100% ran full offline PCM processing, even when
the requested gain was safely below the conservative peak ceiling. Safe clips
now use their decoded buffer and requested voice gain directly. Clips that
need protection still use linked-channel look-ahead limiting and FIR peak
checks. Analysis/DSP yield less frequently, reducing native JS timer overhead.
Cancellation, memory limits, overlap, repeat and native-clock progress remain.

Playback now explicitly resumes a suspended AudioContext alongside decoding.
Both operations have rejection handlers immediately; completion after Stop all
or a superseding pad cannot start the old request.

Implementation was delegated to a `gpt-6-luna` worker with high reasoning
effort and reviewed by the primary agent. Existing workspace changes were
preserved; no commit or push was performed. The follow-up below installed an
update on the emulator only.

## Verification

- 133/133 Play tests pass using Node 24 directly, including 20 playback tests.
  New coverage checks safe 200% gain without derived PCM allocation, deferred
  resume, superseding/stopping during resume, and resume failure while decoding.
  The shaper check verifies configuration and cleanup, not audible rendering.
- Strict Play TypeScript passes; 11/11 stage/release-plugin tests pass.
- 46 deterministic mono/stereo fixtures at 44.1/48 kHz pass independent FFmpeg
  `ebur128=peak=true` analysis below 0 dBTP. Quiet 200% gain retains +6.02 dB.
- On this Windows PC, a 10-second, 48 kHz stereo sine at amplitude 0.85 and
  200% gain took approximately 2,178 ms before and 437 ms after in
  `processClipPcm`. These are desktop processing measurements, not phone
  tap-to-audio latency. Safe quiet boosted clips now skip this processing.

Logs, baseline source copies and regenerated fixture measurements are under
the ignored `data/playback-fix-20261022/` directory. The previous amplification
QA remains historical; its shared final 4× shaper description is superseded
by this record.

## Emulator follow-up — startup delay remains open

At the owner's request, the API 36 x86_64 `Soundboard_API_36` emulator was
started and the patched Play APK/AAB built successfully. Docker startup first
failed on an inaccessible stale runtime socket. Its containing directory was
preserved as `docker-secrets-engine.playback-qa-backup-20261022`, allowing Docker
to recreate the runtime socket. Docker's own startup update interrupted the
first build; the retry passed all ordinary artifact audits.

The APK was signed with the existing local testing certificate and installed
with `adb install -r` on `emulator-5554`. The existing My recording entry
remained visible. Two deterministic two-second WAV tones were imported through
the ordinary Editor, saved and assigned to empty pads. UI checks covered cold
playback after the board loaded, natural end followed by the other pad, rapid
replacement, 200% looping beyond the clip duration, and Stop all. The emulator
was left on the ordinary Board with the two QA sounds available; the B tone's
repeat preference was restored to Once. No physical phone was targeted.

The separate package `dev.sarunas.soundboard.play.playbackqa` stages the exact
production playback engine and DSP. A wrapper logs real-time `source.start()`
invocations. Independently, a native OfflineAudioContext uses the production
limiter curve and graph topology: A440 ends at 1.2 seconds, the render suspends
during idle at 2 seconds, then B1760 is added before resuming. This exercises
the native graph's disabled-input behavior; it is not an acoustic or real-time
device-output recording. QA source hashes and overrides are recorded in the
ignored harness stage.

The native comparison reproduces the reported tail exactly. With the former
shared 4× shaper, the first 40 ms after B starts contains A440 at amplitude
0.12 with essentially no B1760, followed by a mixture during 40–120 ms. With
the fixed non-oversampled shaper, B1760 starts at the expected 0.24 amplitude;
independent joint sinusoidal fitting finds A440 below 4×10⁻⁷ (PCM16
quantization scale). Both native WAVs and JSON reports were exported through
the normal Android folder picker, then analysed independently on the host.

The emulator **disproved that the startup-delay fix was sufficient**:

| Loud stereo fixture | Gain | Cold URI/gain start | Immediate cached start |
|---|---:|---:|---:|
| 10 seconds | 100% | 4,777 ms | 1.3 ms |
| 10 seconds | 200% | 4,757 ms | 2.2 ms |
| 60 seconds | 100% | 29,140 ms | 19.3 ms |
| 60 seconds | 200% | 29,263 ms | 60.7 ms |

These are emulator JS request → native source.start invocation timings, not
speaker latency. The four cold cases failed the harness's 1,000 ms limit.
Native repeat-three, overlap at 100%/200%, explicit stop, cancellation during
cold preparation and suspended-context resume passed. The fixed run passed
11/15 checks; the old-filter comparison passed 10/15 because it also failed the
tail check. Its timing pipeline otherwise uses the same current DSP.

The remaining bottleneck is full-clip PCM protection/oversampled peak analysis
in Hermes before first playback. A bounded JS optimization experiment did not
provide enough improvement and was discarded; the production DSP was restored
to the exact APK-tested hash and the 20 playback tests rerun successfully.
The next implementation needs to move that work off the first pad press, or
perform it in native code. The startup issue remains open; the tail fix has
native regression evidence. Physical-phone listening remains pending.

Signed ordinary test APK:
[`stimmyz-playback-fix-testing.apk`](../data/playback-fix-20261022/app-build-retry/artifacts/stimmyz-playback-fix-testing.apk)
(x86_64, version 1.0.18/code 19, SHA-256
`5d58299ad1ba010902ed7f4e049c0ef8f6a1444e989ef0e925ce8904202702df`).
Harness sources, manifests, exported JSON/WAVs and independent tail analysis
are under `data/playback-fix-20261022/native-qa/`.

## Phone installation — 2026-10-22

At the owner's explicit request, the same source was built for ARM64 and
installed on the connected Samsung SM-S928B, serial `R5CWC206XDT`, using
`adb install -r --user 0`. The installed app's certificate was checked before
the update and matched the existing local Play testing certificate. APK/AAB
build audits and signed APK verification passed.

Installation returned Success and a cold launch returned Status: ok in 259 ms.
The app remained running without a fatal launch error in its scoped log. User
0's data inode `170828` and original first-install timestamp were unchanged.
No uninstall, data clear, or installation into the other phone profile occurred.
This verifies installation and launch, not physical listening or a correction
of the outstanding cold-clip startup delay.

Signed phone APK:
[`stimmyz-playback-fix-arm64-testing.apk`](../data/playback-fix-20261022/phone-arm64-build/artifacts/stimmyz-playback-fix-arm64-testing.apk)
(ARM64, version 1.0.18/code 19, SHA-256
`6c342d6e1572358fcca7e9c12175ca2395464520f736093a52a3177c23735c47`).
Package metadata, certificate verification and scoped launch logs are retained
under `data/playback-fix-20261022/phone-*`.

## Native PCM preparation follow-up — 2026-10-22

Android now runs the existing TypeScript PCM analysis and limiter algorithm in
a background C++ worker. This removes full PCM scans and filtering from Hermes
before Android playback. The native command-line differential matches the
TypeScript implementation within `2e-6` for every checked case. Core compute
times were 74.3 ms for a 17-second stereo clip at 200% gain and 267.2 ms for a
60-second clip. The separate ADB end-to-end timings were 337 ms and 1,022 ms;
they include ADB staging, transfers and file I/O. They do not measure Expo JS
bridge or full playback-engine overhead.

The follow-up passed 145 Play tests, strict TypeScript, and all 11 root
staging/release-plugin tests. The ordinary signed version 1.0.19/code 20 APK
and AAB passed their build audits for ARM64 and x86_64. The APK was signed
with the existing testing certificate and installed on the connected phone,
preserving the existing app data. The later physical RedSun retest is recorded
below.

## Native emulator playback QA — 2026-10-22

The full emulator playback harness passed all 20 checks. Cold taps reached the
native `source.start()` invocation in these times, including decode and PCM
preparation. These are not acoustic output measurements:

| Stereo clip | Gain | Cold tap to `source.start()` |
|---|---:|---:|
| 17 seconds | 100% | 158.7 ms |
| 17 seconds | 200% | 145.5 ms |
| 10 seconds | 100% | 83.2 ms |
| 10 seconds | 200% | 71.6 ms |
| 60 seconds | 100% | 653.6 ms |
| 60 seconds | 200% | 411.6 ms |

The quiet 17-second clip at 200% started in 35.3 ms. Same-URI and gain cache
hits ranged from 2.2 to 44.8 ms, and resuming a suspended context took 20.8 ms.
The filter-tail, repeat-three completion, 100% and 200% overlap, explicit
Stop, cancellation during cold decode, and suspended-context resume checks all
passed. The exported harness results are at
[`results.json`](../data/playback-cold-start-20261022/native-qa/exported/Playback-fix-native-QA-2026-10-22T07-20-06-477Z/results.json).

The signed ordinary APK was installed on the connected phone after emulator QA.
Its SHA-256 is
`21167ebd4b4bd8a228186e501e96db73613759b48abdf98ff80ec8746e793721`; package
metadata checks after installation confirmed that the existing data inode and
install time were unchanged. The APK is
[`stimmyz-native-playback-testing.apk`](../data/playback-cold-start-20261022/native-play-build/artifacts/stimmyz-native-playback-testing.apk).

## Physical RedSun retest — 2026-10-22

The 1.0.19/code 20 build was force-stopped and cold-launched on the connected
phone. Launch returned `Status: ok` in 178 ms. After waiting 500 ms, the RedSun
pad was tapped. The first screenshot capture ran from 103 to 636 ms after the
tap and showed no progress; the next ran from 639 to 1,158 ms and showed active
RedSun progress with Stop all. Progress continued through the 5-second capture.
This places visible active progress within roughly 0.64–1.16 seconds, compared
with the roughly five-second delay reproduced on 1.0.18. The screenshot method
uses an ADB input tap and host-side capture times; it does not measure acoustic
latency or prove when sound became audible.

The ARM64 native library loaded successfully. The scoped phone log has no
`FATAL`, exception, or playback error. Post-test package metadata confirmed
that the existing data inode and install time were unchanged. The timing record
is [`red-sun-native-timing.json`](../data/playback-cold-start-20261022/red-sun-native-timing.json),
the active-progress capture is [`red-sun-native-00200.png`](../data/playback-cold-start-20261022/red-sun-native-00200.png)
(its filename says `00200`, while its recorded capture window is 639–1,158 ms),
and the scoped log is [`red-sun-native-logcat.txt`](../data/playback-cold-start-20261022/red-sun-native-logcat.txt).
The screen recording is [`red-sun-cold-start-after.mp4`](../data/playback-cold-start-20261022/red-sun-cold-start-after.mp4).

This completes the physical RedSun UI-progress retest. Broader physical playback
QA, listening checks, and measured acoustic latency remain unverified. The
emulator timings above remain source-invocation measurements for their tested
fixtures, not physical-device or speaker-output timings.
