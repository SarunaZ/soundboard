# Per-sound amplification — 2026-10-21

The owner asked to continue the unfinished amplification requirement. The
October 21 handoff calls for gain 0–200%, shared clip preferences and protected
output. The prior testing APK exposed only 0–100%.

## Plan and scope

- Replace the old gain-sum headroom path: dividing by the requested clip gain
  canceled amplification above unity.
- Process boosted or potentially unsafe decoded clips into derived PCM with
  linked-channel look-ahead limiting and reconstruction-peak checks. Preserve
  quiet linear gain, source files, stable sound IDs and master-volume semantics.
- Bound/cache derived buffers, serialize temporary DSP work and cancel stale
  requests. Retain restart, once/loop/three plays, native-clock progress,
  overlap and Stop all.
- Enable the 200% range in the local testing APK, with direct mute/original/boost
  presets, correct dB readout and draft Cancel/Save behavior.
- Verify generated PCM independently using FFmpeg, then render the same DSP and
  output graph through the installed native Audio API in a separate QA package.
  Check the ordinary app's 200% setting, persistence and playback on the emulator.

Implementation was delegated to `gpt-6-luna` workers at high reasoning effort,
with separate ownership of audio, the clip modal, and isolated native QA.
The primary agent reviews the result and runs verification. Existing user
changes and Dev sources are preserved. No commit, push or publication is part
of this work.

## Processing strategy

Source PCM → per-clip gain and linked-channel limiter → protected derived
AudioBuffer → overlap headroom from conservative clip peak bounds → app master
gain → oversampled native WaveShaper fail-safe → output.

The limiter uses a short look-ahead, a controlled release and a four-times
windowed-sinc reconstruction estimate with additional margin. It never adds
makeup gain to an already limited clip. Quiet clips below the ceiling retain
their requested linear gain. Both channels share the limiter envelope.

The configured sample ceiling is −2 dBFS, with 0.6 dB additional padding on
the reconstruction estimate. An initial −1 dBFS candidate left only 0.2 dB
of measured transient margin, so the final ceiling was reduced before native
QA. Mix headroom uses protected peak bounds, rather than canceling the gain
setting. Replacement playback waits until pending 8 ms fades have ended;
otherwise an old fading voice and a new boosted voice could briefly exceed
the mix bound. The native progress clock starts at that scheduled start time.

This is a tested anti-clipping strategy, not a claim of a certified true-peak
limiter. Independent fixture measurements and native rendering are recorded
below. Physical acoustic behavior and human listening remain
release acceptance checks; this is a local testing build.

## Evidence

Reproducible fixture generators, FFmpeg analysis, the isolated QA app and logs
are under [`data/play-amplification-qa-20261021/`](../data/play-amplification-qa-20261021/).
The native QA package uses `dev.sarunas.soundboard.play.audioqa`, leaving the
ordinary Play package and its saved data separate. QA entrypoint overrides are
applied only inside a verified ignored source stage.

The earlier folder-picker recovery check was retried successfully: after
changing Android text size, the picker opened and export completed. Evidence:
`picker-recreation-retry.log`, `picker-recovered.xml`,
`picker-recreation-export-result.xml`.

## Verification results

- **127/127 Play tests in Docker**, strict TypeScript, and **11/11 source-stage
  and release-plugin tests** pass. Tests cover gain ratios, finite PCM,
  stereo-linked limiting, reconstruction peaks, overlap, restart scheduling,
  stale decode/DSP cancellation and memory limits.
- **46 deterministic PCM fixture outputs** at 44.1/48 kHz passed independent
  FFmpeg `ebur128=peak=true` metering. Quiet sine gain measured 0 / +3.52 /
  +6.02 dB for 100 / 150 / 200%. The highest measured peak was **−1.2 dBTP**.
  Inputs include full-scale tones, impulses, alternating decaying transients,
  the Fs/4 `[a,a,-a,-a]` intersample case, near-Nyquist material, deterministic
  stereo noise and aligned two/eight-voice mixes.
- The isolated Android API 36 QA app rendered the production DSP through
  `react-native-audio-api` **0.13.2 OfflineAudioContext**, with the actual
  per-voice/mix/master/WaveShaper graph. **13/13 native cases passed**. The DSP
  source hash matched the production file. Outputs were retrieved only from
  that QA package's cache; the QA app was then uninstalled and ADB unrooted.
- FFmpeg independently checked all **13 Android-rendered WAVs**. All stayed
  below 0 dBTP; the highest measured peak was **−0.6 dBTP**. The measured
  200%/100% quiet RMS ratio was **1.999993** (**+6.02057 dB**). Master mute was
  digital silence. Native cases also cover linked stereo, transients and two
  and eight aligned overlapping voices.
- In the ordinary Play app, selecting the 200% preset showed **200% / 6.02 dB**,
  saved successfully and survived a process restart. Library opened the same
  sound ID with the same value. Native screenshots include
  `boost-200-final.png` and `boost-persisted-library.png`. Canceling a 100%
  draft retained the saved 200% value (`boost-cancel-confirmed.png`).
- The final signed APK was installed and exercised on the emulator. A boosted
  loop played, restarted on another tap and stopped through Stop all. Evidence:
  `boost-playing-final.png`, `final-playback-start.log` and
  `final-stopped-board.xml`. The emulator is left open at the saved 200% control.

The fade scheduling fix changes engine scheduling only; the production DSP
file is identical to the one exercised by the native renderer. Native UI
timing observations and fixture renders are not physical listening claims.

## Final testing APK

[Download the signed testing APK](../data/play-amplification-qa-20261021/stimmyz-amplification-testing.apk)
(66,141,493 bytes; package `dev.sarunas.soundboard.play`, version 1.0.18/code 19).

SHA-256: `b9251e545b05c54196d9d7530554d17fc202687a26bf3cf495a7e0e2b714f0d6`.

The Docker native build passed its manifest, native-library and autolinking
audits. APK v2/v3 signatures and 16 KiB alignment were verified. The final
source-stage comparison covered 78 files with zero mismatches. Build and
verification evidence is in `native-final-build.log`,
`signature-verification.txt`, `alignment-verification.txt` and
`final-source-verification.txt` under the QA directory. Unsigned APK/AAB outputs
are in `data/play-amplification-final-20261021/artifacts/`.

Docker provided builds and automated tests. The emulator runs through the
Windows Android SDK because this Docker environment has no emulator runtime
or `/dev/kvm` acceleration.

## +12 dB boost follow-up — 2026-10-22

The boost mapping now reaches +12 dB at the existing 200% setting. Raw saved
gain values remain in the same 0–2 range. Values through 100% retain their
linear amplitude; 100% is unity, 150% maps to an amplitude ratio of 1.995262
(about +6 dB), and 200% maps to 3.981072 (about +12 dB). The shared converter
is used by both the engine and the playback-options UI. The limiter, peak
ceiling and native quiet-clip fast path are unchanged.

The owner confirmed the original playback issue was fixed on version
1.0.19/code 20; version 1.0.20/code 21 adds the higher gain mapping. The new
dual-ABI build passed build audits and signature verification. It passes 145
Play tests, strict TypeScript, the scoped 32-test playback/facade suite, all
23 native runtime QA cases, and 24/24 independent FFmpeg fixture checks. Ten
native differential cases match TypeScript through maximum amplification with
absolute error at or below `2e-6`.

The native runtime measured cold 200% starts at 140.7 ms for a 17-second stereo
clip and 387.4 ms for a 60-second stereo clip. A quiet 17-second clip started
at 20.0 ms with 150% control and 40.3 ms at 200%; the corresponding applied
voice gains were 1.995262 and 3.981072. These are emulator source-start times,
not acoustic measurements. FFmpeg measured the quiet-signal gain at +6.000 dB
and +12.000 dB for 150% and 200%; the highest true peak across the
24 fixtures was −1.5 dBTP.

The existing emulator's saved 200% setting reopened with the `+12.00 dB`
readout and preset selected, and the clip played through the native graph
without errors. Evidence includes the
[native playback report](../data/play-boost-12db-20261022/exported/Playback-fix-native-QA-2026-10-22T07-48-30-493Z/results.json),
[FFmpeg fixture report](../data/playback-cold-start-20261022/native-qa/boost-ffmpeg-fixtures/results.json),
and [emulator options capture](../data/play-boost-12db-20261022/emulator-options-12db.png).

The signed APK was installed successfully on the emulator and the connected
Samsung Galaxy S23 (SM-S911B, serial `RFCWA17DAJW`). The phone's existing
version 1.0.18 used the same testing certificate. `adb install -r --user 0`
returned Success; the cold launch returned in 455 ms behind the locked UI.
User 0's data inode `1239817` and first-install timestamp `2026-10-20 21:30:16`
were unchanged. Since the phone remained locked, this records installation and
launch only; physical playback and listening were not tested. The APK is
[`stimmyz-12db-testing.apk`](../data/play-boost-12db-20261022/app-build/artifacts/stimmyz-12db-testing.apk)
(SHA-256 `c749959c309870139659b340e7244687f4738c1df814a2e2bcf675920212358a`).
