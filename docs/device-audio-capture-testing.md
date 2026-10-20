# Device audio capture test procedure

Branch: `feat-sound-recording`. This is an optional Play-only spike.
See [plan](device-audio-capture-plan.md), [handoff](device-audio-capture-handoff.md)
and [results](../DEVICE_AUDIO_CAPTURE_RESULTS.md). Only recorded evidence in the
results report constitutes a pass.

## Build and automated checks

From the repository root, using the existing Docker toolchain:

```powershell
docker compose --profile tools run --rm --no-deps --entrypoint /bin/sh deps -lc 'corepack enable && yarn workspace app-play test && yarn workspace app-play check'
node --test scripts/verify-play-stage.test.mjs scripts/play-release-plugin.test.cjs
.\scripts\test-device-audio-native.ps1
.\scripts\build-play-android.ps1 -StageOnly
.\scripts\build-play-android.ps1
```

The native build creates unsigned artifacts in an isolated ignored `data/`
directory. Review that build's release information, permissions/service and
autolinking audit, not an older APK. Use a testing signature matching an existing
installation to update it without data loss; do not uninstall or clear user data
to work around a signature mismatch. The fixture's own build/run instructions
are in [its README](../tools/device-audio-test-player/README.md).

`test-device-audio-native.ps1` mounts a dedicated 64 KiB tmpfs in its Docker
container and sets `DEVICE_AUDIO_FAULT_DIR` for the JVM suite. The configured
test writes 128 KiB through `PcmWavWriter` within its normal data bound, requires
a real ENOSPC error and partial output, closes the writer, confirms its file
descriptor is closed before unlink, and removes its unique partial file. If the
environment variable is absent when running the test outside this harness, the
constrained-filesystem case is skipped. This isolates a real WAV-writer disk-full
path without filling a phone or emulator; it does not test Android service
cleanup or `AudioRecord` read failures.

## Controlled capture first

Use a test emulator or phone with Play and the separate tone-player fixture.
Record Android version/API, Play version/target SDK, fixture policy, output route
and notification/channel permission state. Keep media volume at a comfortable
audible level; verify the fixture itself plays before judging capture.

1. Open the fixture, select **ALLOW_CAPTURE_BY_ALL** and start its synthetic
   MEDIA tone pattern. Then open Stimmyz → Editor → **Record device audio**.
2. Grant Android audio and notification permissions when requested, and approve
   projection consent. Record the exact system choice (whole device or app).
   If selecting one app, select the fixture. This source records audio only.
3. Return to the fixture and play at least 5–10 seconds. Verify the ongoing
   Stimmyz recording notification remains visible while Stimmyz is backgrounded.
4. Use notification **Stop**. Return to Stimmyz using its notification or app
   icon. Verify the timer stops, projection ends, and the result enters Trim
   exactly once with a plausible duration and a nonflat waveform.
5. Preview the tone, trim a recognizable portion, choose a unique QA name, skip
   artwork, and save once. Verify exactly one Library entry, board assignment
   where requested, and playback after force-stop/relaunch with networking off.
6. Repeat with fixture **ALLOW_CAPTURE_BY_SYSTEM**, then **ALLOW_CAPTURE_BY_NONE**
   (restart fixture playback after changing policy). Expect silence/restriction
   handling; do not save an empty clip. Confirm retry/microphone/import remain
   usable. Also test the fixture stopped or muted.
7. While capture runs, make room noise/speak without playing source audio.
   Verify the output contains no microphone signal. Record this observation
   separately from a flat-waveform or zero-sample check.

An emulator's waveform/file measurements do not prove physical-device audio
quality or Samsung compatibility. Exact zero/near-silence may indicate source
policy, source silence, output routing or an implementation problem. Fix a
failing controlled ALL baseline before diagnosing other apps.

The 2026-10-20 Galaxy S24 Ultra smoke also captured a generated 550 Hz HTML tone
from Chrome 155 to a 5.75 s Trim result; after stopping the looping source, the
owner confirmed the captured tone was clear. A separate quiet synthetic PCM16
source showed **Very quiet recording**; **Review recording** opened Trim with
the quiet warning still visible. These are generated-source/UI checks, not
YouTube-in-Chrome evidence or broad acoustic-threshold validation. Both drafts
were discarded without Library entries. See the [results report](../DEVICE_AUDIO_CAPTURE_RESULTS.md).

## Consent, interruption and cleanup

Run each case from a fresh explicit recording action. Check no ongoing service,
projection or partial owned file remains after terminal failure/cancellation;
already-saved Library files must remain intact.

| Case | Expected behavior |
| --- | --- |
| Deny audio permission | Explain permission; no capture/file/service starts. Existing microphone/import are usable. |
| Deny notifications or disable the channel | Explain visible Stop requirement; do not start capture. |
| Cancel projection consent | Return safely to Source, no recording or new Library entry. |
| Rapid double-tap Start/Stop | At most one session and one staged result; no duplicate Save. |
| Switch apps and return | Device capture continues; microphone retains its foreground-only cancellation behavior. |
| Stop from notification with JS backgrounded | Capture finalizes independently; returning adopts once. |
| Stop from Android projection UI | Session ends, all native resources release, outcome is explained. |
| Lock/unlock phone | Session ends or follows verified OS behavior safely; no perpetual silent recording. |
| Cancel/Back during consent or preparation | Late permission/consent result cannot start an abandoned session. |
| Cancel while stopping/decoding | No late Trim transition or orphan source/file. |
| Force-stop/process death | No auto-restart or token reuse. Next launch handles stale owned temp files safely. |
| Reach 120 seconds | Native capture terminates even while JS is paused; result is bounded. |
| Low storage/write/read error | API 29 emulator test filled only emulator `/data`, displayed `write failed: ENOSPC (No space left on device)`, and stopped service/projection. It preserved the pre-existing unsaved draft; no Save action was taken after the fault. The exact reserve/fill files were removed and free space restored. Library/cache enumeration was unavailable, so verify the [bounded test evidence](../data/device-audio-older-android-20261020/results.md) while keeping partial app-cache cleanup unconfirmed. The Docker tmpfs JVM test verifies writer-level ENOSPC and descriptor/output cleanup; Android AudioRecord read errors remain untested. |
| Change Bluetooth/headphones/audio route | Record actual waveform/audible output and lifecycle outcome. |
| Repeat 3–5 sessions | Fresh consent each time, no stale result/token, no cumulative resource leak. |

Inspect module-owned cache and Android service/projection state with the Android
tools used for the test build. Do not log raw samples, active-app titles/URLs or
private media. Retain only authorized fixture output, technical metrics and
non-sensitive screenshots/logs as evidence.

## Galaxy S24 Ultra final test

For the 2026-10-20 Galaxy S24 Ultra run, record the exact model, Android/API and
One UI values; do not infer them from the product name. The controlled ALL,
SYSTEM and NONE cases, safe audio/notification denial, disabled-channel refusal,
projection cancellation and cold offline board playback are recorded in the
[results report](../DEVICE_AUDIO_CAPTURE_RESULTS.md). Wi-Fi/data were disabled,
Play was force-stopped and cold-started with no active default network, and the
synthetic clip's pad assignment remained playable. The temporary assignment was
cleared with owner authorization while both saved Library clips remained.

The 2026-10-20 comparison used the same original YouTube clip selected
independently in YouTube for Samsung's native **Media sounds** capture and
Stimmyz capture. The owner confirmed clear audio from both; the native screen
recording included video as expected. The native file was not imported/copied
into Stimmyz. This is evidence for the tested clip, YouTube 21.41.525/code
1561303420, Samsung Smart Capture 6.1.80.31/code 618031000 and this handset only.
It does not establish compatibility with all YouTube content or Shorts. For
future comparisons, use comparable volume, route and 5–10-second intervals:

1. Samsung's native screen recorder, **Media sounds**: record and inspect audio.
2. Stimmyz's **Record device audio**: independently capture and inspect audio.
3. Record both results, versions and consent mode. If native recording works but
   Stimmyz is silent, document the divergence without attempting a workaround.

Specific clips in YouTube/Shorts, Chrome, TikTok and Instagram Reels were later
tested in Stimmyz; see the results report for the owner-reported scope and
versions. For additional sources, clips or devices, repeat the authorized
capture/stop/preview check and mark unavailable apps/devices NOT TESTED. Confirm
a second non-Samsung handset only if one becomes available. Native Samsung
success alone never counts as Stimmyz capture success.

## Regression and reporting

Check existing microphone and file/video import → Trim → Customize → Save;
keyboard/Back, target board/pad retention, optional artwork, assignment retry,
and cold offline Library playback. Check all six themes, compact/large text,
Quick Add first/edit-only arrow, ordinary pad and Library overflow, and unchanged
Dev app identity/data/build boundary. Restore temporary emulator display/network
settings after QA and leave the owner's saved clips/boards intact.

Populate AC-01–AC-13, source compatibility and permissions observations in the
results report. Recommend rollout only after the controlled physical baseline,
useful source capture, safe lifecycle and end-to-end save actually pass.
