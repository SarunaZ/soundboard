# Stimmyz device-audio capture test results
Date: 2026-10-20
Commit / branch: baseline b1376c9 / feat-sound-recording (uncommitted spike)
Build variant / targetSdk: Play 1.0.16/code 17, release testing APK (local testing signature), ARM64 + x86_64; minSdk 24, compileSdk/targetSdk 36
Devices + Android / One UI versions: emulator-5556, Android 10/API 29; emulator-5558, Android 14/API 34; emulator-5554, Android 16/API 36; Samsung Galaxy S24 Ultra SM-S928B, Android 16/API 36, build S928BXXS6DZI1. Raw One UI property value: 80500 (not decoded). API 29/34 results are emulator baselines, not physical OEM support claims.

Implementation and build are complete. Physical verification is **PARTIAL**.
The same-signer Play update was installed with `adb install -r` from 1.0.1/code 2
to 1.0.16/code 17. The Dev package remains unchanged at 1.0.3/code 4. Display
density override was 420 and font scale 1.15. YouTube was 21.41.525/code
1561303420; Chrome was 155.0.8059.84/code 805908404; Samsung Smart Capture was
6.1.80.31/code 618031000. The existing APK SHA-256 below is unchanged.

On this phone, the owner confirmed the generated fixture tones were clearly
audible. A controlled ALL-policy Capture Fixture recording was trimmed by
dragging both handles from 0–31.20 s to 2.53–9.94 s, selecting 7.41 s; it was
named `samsung-capture-qa`, kept the default artwork, and was saved once. The
owner confirmed the captured fixture preview plays clearly before save. The
Library then showed the 7.41 s QA clip and the user's separate 6.21 s YouTube
recording. After the later cold offline board check, the owner auditioned the
saved QA clip and confirmed it was clear. The 6.21 s YouTube file was not
separately auditioned after save. In a separate
run, the owner used YouTube 21.41.525/code 1561303420 during Stimmyz capture and
confirmed the captured preview plays before save; the YouTube consent mode was
not observed. This evidence covers only the tested user-selected material in
this YouTube app/version on this phone. The owner later separately reported
successful capture, stop and preview for one tested Shorts clip; that does not
establish compatibility with all Shorts, other YouTube material, other apps,
or other devices.

A controlled ALL-policy Capture Fixture run used Android's single-app consent
with Capture Fixture explicitly selected. The mediaProjection foreground
service was observed with service type `0x20`. Notification Stop opened a 31.20 s
Trim result and left no capture service running. Both handles were dragged to
2.53–9.94 s (7.41 s); the preview was confirmed clear, then `samsung-capture-qa`
was saved once with default artwork. The waveform screenshot at
[`all-trim.png`](data/device-audio-samsung-20261020/all-trim.png) shows a
non-flat waveform. After the later cold offline board check, the owner
auditioned the saved fixture QA clip and confirmed it was clear. The separate
6.21 s YouTube file was not separately auditioned after save.

Separate physical SYSTEM and NONE fixture checks were run after changing
policy, starting a fresh tone, and granting fresh single-app consent selecting
Capture Fixture each time. In both cases the fixture was playing, notification
Stop returned to Source with the exact no-usable-audio/restriction message, and
no capture service remained. Screenshots: [SYSTEM](data/device-audio-samsung-20261020/system-restricted.png),
[NONE](data/device-audio-samsung-20261020/none-restricted.png). After NONE, the
Library still contained exactly the two known clips, with no empty capture.
The fixture was force-stopped, then Play was force-stopped and relaunched to
Library while online. Both clips remained, no device-audio service was present,
and `dumpsys media_projection` returned `null`. This was an online restart, not
an offline test. The volume setting chosen by the owner was 6/15 and remains
preserved. No private audio was exported and no source URL was logged. During audio-only capture,
`dumpsys media_projection` emitted a system diagnostic NullPointerException for a
null `ContentRecordingSession`; no app crash was observed, and service state was
corroborated independently. Preserve the owner's original Library recording.

Additional physical checks on the same build confirmed cold offline behavior:
the synthetic `samsung-capture-qa` clip was assigned to Main's first empty pad,
Wi-Fi and mobile data were disabled, Play was force-stopped and cold-started,
and diagnostics showed no active default network. The assignment remained and
board playback started an AAudio track. The owner confirmed, “Yes, clear saved
tones.” Wi-Fi and mobile data were restored to 1/1. The temporary assignment was
then removed with **Clear pad**; both the original 6.21 s YouTube recording and
7.41 s QA clip remained in Library.

On this phone, denying the actual Android `RECORD_AUDIO` prompt showed the
permission explanation and started no service. Denying `POST_NOTIFICATIONS`,
and separately disabling then testing the capture notification channel, showed
the visible-Stop requirement and started no service. Permissions and channel
were restored. Cancelling fresh projection consent returned “Device audio
recording was cancelled. Nothing was saved.” with projection null.

With the fixture stopped under ALL policy and a fresh single-app consent,
capture was active at age 92 s while the owner made room noise near the phone.
The app auto-stopped and rejected the silent-source result as no usable audio;
no clip was saved. No captured-file acoustic analysis or waveform/sample
statistics were obtained, so this does not directly measure microphone
isolation. The session remained active through keyguard lock/unlock. It was
still foreground at 109.359 s and absent at the next check about 125 s while
Stimmyz was backgrounded; this is within the polling window, not exact deadline
instrumentation. A separate fresh silent-source capture was rotated to actual
`ROTATION_90`, confirmed by window diagnostics, while capture remained active.
Force-stopping Play during that active session removed the service and
projection; relaunch did not resume it, and the next explicit start requested
fresh projection consent, which was cancelled. After restoring
permission, physical microphone recording produced a 52.52 s Trim; the owner
confirmed the spoken test phrase was audible. The unsaved draft was discarded
and no microphone clip was saved.

For the Samsung comparison, the owner selected the same original YouTube clip
independently in YouTube for Stimmyz and Samsung's native **Media sounds**
capture, following the test instructions. The owner confirmed the Samsung
recording captured the audio clearly; Samsung's native screen recording also
included its expected video. The previously described Stimmyz capture preview
of the user-selected YouTube material was also confirmed clear. The native file
was not imported or copied into Stimmyz. This comparison applies only to this
clip, YouTube 21.41.525/code 1561303420, Samsung Smart Capture 6.1.80.31/code
618031000 and the tested phone; it does not establish general YouTube or Shorts
compatibility.

Separate generated-tone checks were run through Chrome 155.0.8059.84/code
805908404. A local 550 Hz HTML tone reached a 5.75 s Trim result; an initial
audition was confounded because the browser source was still looping. After the
source was stopped and visually confirmed stopped, the owner confirmed, “Yes,
clear captured tone then stopped.” This verifies only generated audio from
Chrome on this build, not YouTube played in Chrome. A separate quiet synthetic
PCM16 tone (peak about 41/32768, RMS about 29/32768) produced the **Very quiet
recording** dialog; **Review recording** opened Trim with the quiet warning
still visible. Both unsaved drafts were discarded, no Library clip was added,
and the source, local server, USB forward, service and projection were stopped
or removed. These are UI-threshold observations, not a judgment of real-world
quiet audio quality; the threshold remains provisional.

The same-day supplementary JVM harness passed 7/7 tests, including a real
post-open ENOSPC on a dedicated 64 KiB Docker tmpfs. It confirmed the 128 KiB
write returned “No space left”, left partial output, and closed the writer
descriptor before the test deleted its unique file. This is writer-level
coverage, not Android service fault injection. The tested APK and SHA-256 below
are unchanged; the supplementary tests did not alter production code or rebuild
that APK. The original 3/3 JVM result below remains the test record associated
with the APK build.

## Older Android emulator baseline

Play 1.0.16/code 17 and the synthetic Capture Fixture were exercised on isolated
Android 10/API 29 and Android 14/API 34 emulators. Both showed the contextual
RECORD_AUDIO prompt, fresh projection consent, an ALL-policy capture with the
foreground capture service and ongoing Stop notification, a non-flat Trim
waveform after notification Stop, and clean service/projection teardown. API 29
diagnostics showed a `TYPE_SCREEN_CAPTURE` projection; it has no runtime
notification permission and produced a 37.52 s Trim result. API 34 showed both
audio and notification prompts; cancelling consent was safe, and a later
81.17 s capture was previewed to the UI's “Preview playing” state. This does
not establish human audibility. A fresh API 34 force-stop cleared
service/projection and relaunch did not resume capture. A separate bounded
API 29 `/data` exhaustion test caused the active service to stop and displayed
`write failed: ENOSPC (No space left on device)`; the exact reserve and fill
files were removed immediately and available space returned to baseline. The
01:59.81 unsaved draft visible afterward was already present before the fault,
not output from the failed write. No Save action was taken after the fault, and
Library/cache enumeration was unavailable. See the
[fault-result hierarchy](data/device-audio-older-android-20261020/api29-enospc-result.xml)
and [pre-fault draft state](data/device-audio-older-android-20261020/api29-enospc-before.xml).
Cache-file enumeration was unavailable, so removal of any partial app-cache
output was not independently verified. All these emulator captures used only
the synthetic ALL-policy fixture; no physical OEM support or SYSTEM/NONE
behavior is inferred.

See the [API 29/34 evidence and artifact hashes](data/device-audio-older-android-20261020/results.md), including [API 29 Trim](data/device-audio-older-android-20261020/api29-trim.png) and [API 34 Trim](data/device-audio-older-android-20261020/api34-trim.png). These are emulator baselines only; physical OEM coverage on older Android versions and SYSTEM/NONE policy behavior remain untested.

Final [APK/AAB and audit records](data/device-audio-ready-20261019/artifacts/).
Signed testing APK SHA-256:
`6278e62b4d2e86d3f19dacc7cb47ff239eb5e8a5af4235e19a8b40f33fe4274f`.
The unsigned AAB is not a published release. Nothing was committed or pushed.

## Acceptance criteria
| Criterion | PASS / FAIL / BLOCKED / NOT TESTED / PARTIAL | Evidence / notes |
| --- | --- | --- |
| AC-01 Source entry API 29+ | PASS (tested emulator scope) | Editor and general Source are present on API 29, 34 and 36 emulators; the older-OS gate has adapter tests and explanatory copy. Physical OEM behavior below API 36 remains unverified. |
| AC-02 Fresh consent and safe denial | PASS (tested scope) | API 29/34 emulators showed contextual RECORD_AUDIO permission and fresh projection consent; API 34 also showed the notification prompt. Projection cancellation was safe on API 34. Physical Galaxy S24 Ultra audio/notification denial and disabled-channel refusal each showed the expected explanation and started no service; permissions/channel were restored. YouTube consent mode and physical older-OS behavior remain untested. |
| AC-03 No microphone mixed | PASS (tested scope) | At 92 s into a capture with the fixture stopped under ALL policy, the owner made room noise near the phone. The app auto-stopped and rejected the silent-source result as no usable audio; no clip was saved. No captured-file acoustic analysis or waveform/sample statistics were obtained, so this is not a direct measurement of microphone isolation. |
| AC-04 Compatible controlled player | PASS | Emulator ALL-policy fixture yields nonzero waveform and a saved playable clip. On the phone, fixture tones were clearly audible live, the controlled capture produced a non-flat 31.20 s Trim waveform, and the owner confirmed the captured tones play clearly in preview. |
| AC-05 Background capture and notification Stop | PASS (tested scope) | Physical Galaxy S24 Ultra: Capture Fixture selected for single-app consent; capture continued while the fixture was foregrounded. Notification Stop opened 31.20 s Trim, and no capture service remained. API 29 and 34 emulator ALL-policy runs also reached non-flat Trim results after notification Stop, with service/projection cleanup. |
| AC-06 Playable file, duration and Trim waveform | PASS | Emulator captured 39.19 s into Trim; dragged range produced a 6.67 s saved clip. On the phone, the controlled fixture waveform was trimmed to 2.53–9.94 s (7.41 s), its preview was clear, and after cold offline board playback the owner confirmed the saved QA clip was clear. The separate 6.21 s YouTube recording's preview was clear before save; its saved file was not separately auditioned. |
| AC-07 Save, offline Library and board assignment | PASS (tested scope) | On the phone, `samsung-capture-qa` was assigned to Main's first empty pad. Wi-Fi/data were disabled, Play was force-stopped and cold-started with no active default network; the assignment remained and AAudio playback started. The owner confirmed, “Yes, clear saved tones.” After the check, **Clear pad** removed only the temporary assignment. Both the 7.41 s QA clip and the user's 6.21 s recording remained in Library; networks were restored to 1/1. |
| AC-08 Silence and quiet handling | PASS (tested scope) | Emulator and physical SYSTEM/NONE/stopped-source cases returned no-usable-audio/restriction handling with no clip. On the phone, a synthetic quiet PCM16 source (peak about 41/32768, RMS about 29/32768) showed **Very quiet recording**; **Review recording** opened Trim with the warning persistent. The draft was discarded. This confirms the quiet-review UI path only; the real-world threshold remains provisional. |
| AC-09 Lifecycle, repetition and cleanup | PARTIAL | Physical checks cover permission/channel denial, projection cancel, lock/unlock, actual landscape rotation, force-stop during active capture, fresh consent after relaunch, bounded silent-source stop, one Bluetooth-to-speaker change with a clear 55.34 s audition, and cleanup of the temporary board assignment. API 36 emulator checks verified two rapid Stop taps yielded one 51.82 s Trim result and no remaining service/projection; two rapid Start taps yielded one consent dialog and safely cancelled. The Android system sharing chip → Stop sharing also revoked projection and returned a no-usable-audio explanation, with no service/projection. API 34 emulator checks additionally verified safe consent cancellation, notification Stop cleanup and force-stop/no-resume. API 29 service-level storage exhaustion produced the explicit ENOSPC error and stopped service/projection; the pre-existing unsaved draft was preserved. No Save action was taken; Library/cache enumeration was unavailable. The bounded reserve/fill files were removed and disk space restored; app-cache partial-file cleanup could not be inspected. A separate 120 s capture ended at UI timer 02:00.01 with a 02:00.00 Trim result; tolerance was not instrumented. Samsung's system Stop control was not located. JVM and API 29 ENOSPC paths are covered, but AudioRecord read errors, brief stopping/decode cancellation, reverse/reconnect timing against the deadline and physical OEM coverage on older Android remain open. [API 29/34 emulator evidence](data/device-audio-older-android-20261020/results.md); [API 36 emulator lifecycle evidence](data/device-audio-regression-20261020/results.md#primary-follow-up--rapid-controls-and-system-stop). |
| AC-10 Modern FGS and projection lifecycle | PASS (tested scope) | API 29, 34 and 36 emulator capture sessions showed the foreground capture service and MediaProjection; notification Stop and process-death cleanup were verified on tested paths. Physical Galaxy S24 Ultra also showed mediaProjection FGS type `0x20`; APK manifest audits require exact service type/non-exported components. Other lifecycle cases remain open. |
| AC-11 No prohibited capture mechanisms | PASS | Exact module allowlist; APK/AAB and generated Expo graph extractor audits pass. No overlay/broad media-read permission, microphone service type, video pipeline, new external capture dependency or bypass. |
| AC-12 Existing sources/UI regression | PASS (tested smoke scope) | Emulator: all six themes, Quick Add first/edit-only control and menu, font-scale 1.5 navigation, picker cancellation, and generated M4A/WAV/AAC/MP4/MOV import-to-Trim with native AAudio output started; MP3 had prior coverage. Phone: 52.52 s microphone capture reached Trim and the owner confirmed the phrase audible; generated Chrome normal-tone and quiet-warning flows were checked; both saved Library clips survived QA pad cleanup. Limits: emulator AAudio start does not establish human audibility; generated-format drafts were not saved or assigned; the physical format/browser cases were synthetic and limited to this phone. See [emulator regression evidence](data/device-audio-regression-20261020/results.md). |
| AC-13 Samsung native vs Stimmyz comparison | PASS (tested clip/device) | Owner selected the same original YouTube clip independently in Stimmyz and Samsung's native **Media sounds** recorder. The owner confirmed clear captured audio; the Samsung screen recording included video as expected. Stimmyz's YouTube capture preview was also owner-confirmed clear. The native file was not imported/copied into Stimmyz. Scope is limited to YouTube 21.41.525/code 1561303420, Samsung Smart Capture 6.1.80.31/code 618031000 and this Galaxy S24 Ultra; no general YouTube/Shorts compatibility claim. |

## Source compatibility
| Source (app/version) | Samsung recorder | Stimmyz POC | Notes |
| --- | --- | --- | --- |
| Controlled fixture 1.0/code 1, ALL | NOT TESTED | PASS (physical capture, preview, save and cold offline board playback) | Emulator: USAGE_MEDIA synthetic three-tone pattern, captured waveform, trim/save and cold offline playback. Phone: tones clearly audible live; single-app consent explicitly selected Capture Fixture; background notification Stop produced 31.20 s Trim and no remaining service. The 2.53–9.94 s (7.41 s) selection was preview-confirmed and saved once as `samsung-capture-qa`. Later, only that clip was assigned to Main's first empty pad; Wi-Fi/data disabled, Play force-stopped and cold-started with no active default network, assignment retained and AAudio playback started. Owner confirmed “Yes, clear saved tones.” **Clear pad** then removed the QA assignment; both it and the separate 6.21 s YouTube recording remained in Library. [Trim screenshot](data/device-audio-samsung-20261020/all-trim.png). |
| Controlled fixture 1.0/code 1, SYSTEM | NOT TESTED | PASS (expected restricted outcome on emulator and phone) | Emulator source confirmed playing with SYSTEM policy; capture auto-stopped while JS backgrounded, reported no usable audio and saved no clip. Phone used a fresh single-app consent session after a fresh tone start; notification Stop returned to Source with the no-usable-audio/restriction message, no service remained and no clip was added. [Screenshot](data/device-audio-samsung-20261020/system-restricted.png). |
| Controlled fixture 1.0/code 1, NONE | NOT TESTED | PASS (expected restricted outcome on phone) | Fresh tone start and fresh single-app consent selecting Capture Fixture; notification Stop returned to Source with the no-usable-audio/restriction message, no service remained, and no clip was added. [Screenshot](data/device-audio-samsung-20261020/none-restricted.png). |
| YouTube user-selected material (not Shorts-specific) | PASS (owner-confirmed audio; native output includes video) | PASS (owner-confirmed preview) | For YouTube 21.41.525/code 1561303420 on this phone, the owner selected the same original clip independently for Stimmyz and Samsung **Media sounds** capture. The owner confirmed clear audio from both; Samsung's screen recording included video as expected. The Stimmyz preview was confirmed before save; the user saved a separate 6.21 s recording as **Device audio recording**. The native file was not imported/copied into Stimmyz. Consent mode was not observed. No general YouTube or Shorts claim. |
| YouTube Shorts (YouTube 21.41.525/code 1561303420) | NOT TESTED | PASS (owner-reported tested clip) | Owner reported Stimmyz capture → stop → preview completed without error. Samsung native comparison was not done for Shorts. No independent waveform/sample analysis; consent mode was not observed; no raw media export. This is not a claim for all Shorts. |
| YouTube in Chrome 155.0.8059.84/code 805908404 | NOT TESTED | PASS (owner-reported tested clip) | Owner reported capture → stop → preview completed without error for a tested YouTube clip. This is distinct from the generated local HTML tone row below. No independent waveform/sample analysis; consent mode was not observed; no raw media export. |
| Generated local HTML tone in Chrome 155.0.8059.84/code 805908404 | NOT TESTED | PASS (generated tone only) | A local 550 Hz HTML source produced a 5.75 s Trim result. The initial audition overlapped the still-looping browser source; after the owner stopped it and the page showed stopped, the owner confirmed the captured tone was clear. This does not test YouTube in Chrome. The separate quiet synthetic source displayed the quiet-review dialog and warning in Trim; it was discarded without a Library entry. |
| TikTok 47.4.3/code 2024704030, target 36 | NOT TESTED | PASS (owner-reported tested clip) | Owner reported capture → stop → preview completed without error. No independent waveform/sample analysis; consent mode was not observed; no raw media export. No universal app/source claim. |
| Instagram Reels 451.0.0.53.80/code 385713116, target 36 | NOT TESTED | PASS (owner-reported tested clip) | Owner reported capture → stop → preview completed without error. No independent waveform/sample analysis; consent mode was not observed; no raw media export. No universal app/source claim. |
| Local player / game | NOT TESTED | NOT TESTED | Versions and actual evidence pending. |

## Known restrictions / crashes

No unresolved app crash was observed in the completed emulator paths or the
physical sessions. During physical audio-only capture, the system's
`dumpsys media_projection` diagnostic raised a NullPointerException because
`ContentRecordingSession` was null; capture-service state was corroborated by
other observations. Other apps' capture policy and OS/profile restrictions can
prevent capture; silence alone cannot identify its cause. Physical evidence is
limited to the tested phone, build and specific clips described above;
owner-reported source checks do not generalize to every clip or consent mode.

Verification:

- 79/79 Play tests plus strict TypeScript passed in Docker; [log](data/device-audio-qa/play-tests-final.log).
- 11/11 integrated stage/config-plugin tests passed; [log](data/device-audio-qa/packaging-tests-final.log).
- 3/3 native JVM WAV tests passed: headers/frame duration/statistics, byte bound,
  zero-signal detection; [XML](data/device-audio-native-tests-final-20261019/artifacts/native-tests/testReleaseUnitTest/TEST-dev.sarunas.soundboard.deviceaudio.PcmWavWriterTest.xml).
  These are WAV tests, not a claim of automated Android service lifecycle coverage.
- Supplemental current-source native JVM harness passed 7/7, 0 skipped: empty
  WAV boundary, invalid-format preservation, constructor descriptor cleanup and
  a real post-open ENOSPC write failure on an isolated 64 KiB Docker tmpfs, with
  descriptor closure checked before unlink and unique partial-file removal;
  [XML](data/device-audio-native-tests-20261020-160858-718/artifacts/native-tests/testReleaseUnitTest/TEST-dev.sarunas.soundboard.deviceaudio.PcmWavWriterTest.xml).
  This did not change production code or the tested APK and does not exercise
  Android service cleanup or AudioRecord read failures.
- Emulator regression smoke on the existing Play 1.0.16/code 17 installation
  verified six themes, Quick Add/menu behavior, font-scale navigation, picker
  cancellation and M4A/WAV/AAC/MP4/MOV import-to-Trim; native audio output was
  reported started, without a human-audibility claim. [Results and screenshots](data/device-audio-regression-20261020/results.md).
- Final dual-ABI APK/AAB build, merged permissions/service attributes, Expo
  module registration, extractor exclusion, unsigned artifact and alignment
  checks passed; [build log](data/device-audio-qa/build-ready.log). Testing APK
  signature v2/v3 and 16 KiB alignment passed.
- Fixture built separately with no declared permissions; package
  `dev.sarunas.soundboard.capturefixture`, version 1.0/code 1. Its generated tones
  are the only captured QA source; no copyrighted recording was distributed.
- Preliminary defects corrected before the final artifact: Gradle module
  metadata, typed manifest service flags, stale projection callbacks, shared
  teardown ownership, cancellation/file-transfer races, and notification Stop's
  stale service-start ID. No known defect is hidden by a compatibility claim.

Emulator evidence: [notification](data/device-audio-qa/notification-final.png),
[final nonzero Trim waveform](data/device-audio-qa/trim-ready.png),
[saved target pad](data/device-audio-qa/board-saved.png),
[cold offline Library](data/device-audio-qa/library-offline.png).
The saved-pad/offline/notification images precede only the final service stop-ID
and status-copy follow-up. The final APK update preserved both clips; its own
15.41-second controlled capture and Trim preview passed after that follow-up.

Final artifact runtime observations:

| Scenario | Actual observation |
| --- | --- |
| SYSTEM-policy fixture, app backgrounded | Projection/service still active at 106 s after marker; both absent at the next check (136 s). Native 120 s deadline code stops independently of JS; exact deadline tolerance was not instrumented. Returning shows the silence/restriction explanation, with no saved clip. [Screenshot](data/device-audio-qa/restricted-system-limit.png). |
| Process death during ALL capture | Force-stop removed projection/service. Relaunch did not resume recording. A new explicit session requested fresh consent and could be cancelled; the following recording also worked. |
| Notification Stop after recovery | Fresh ALL capture → notification Stop → 15.41 s Trim waveform. A subsequent dumpsys check showed projection null and **no device-audio service record**. Preview started app AAudio playback with the fixture process stopped. |
| Physical silent-source deadline and room noise | With fixture stopped under ALL, the owner made room noise near the phone while capture was active at 92 s. The app auto-stopped and rejected the silent-source result as no usable audio, with no clip saved. No file-level acoustic analysis/statistics were taken. Service remained foreground at 109.359 s and was absent at the next check about 125 s while Play was backgrounded; this records a polling window, not exact deadline timing. |
| Physical lock, rotation and force-stop | Keyguard lock/unlock were observed in the room-noise session. Actual `ROTATION_90` was verified by window diagnostics in a separate fresh silent-source session while capture remained active. Force-stop during that active session removed service/projection; relaunch did not resume capture, and the next explicit start requested fresh consent, then was cancelled. |
| Physical denial and consent cancellation | Audio permission denial, notification permission denial, disabled capture channel, and projection-consent cancellation all returned safe explanations with no capture service; permissions and channel were restored. |
| Physical cold offline board playback | After assigning only the synthetic QA clip to Main's first empty pad, Wi-Fi/data were disabled and Play cold-started with no active default network. The assignment remained and AAudio playback began. The owner confirmed “Yes, clear saved tones.” Networks restored to 1/1; **Clear pad** removed only the temporary assignment, and both saved Library clips remained. |
| Physical microphone regression | A 52.52 s microphone recording reached Trim; owner confirmed the spoken test phrase audible. The unsaved draft was discarded, with no Library entry. |
| Physical Chrome generated-tone check | Chrome 155.0.8059.84/code 805908404 local 550 Hz HTML tone produced 5.75 s Trim. After explicitly stopping the still-looping source and visually confirming it stopped, the owner confirmed the captured tone was clear. This is not YouTube-in-Chrome evidence. |
| Physical quiet-warning UI | Synthetic PCM16 tone at about 41/32768 peak and 29/32768 RMS produced **Very quiet recording**; choosing **Review recording** opened Trim with the warning persistent. The unsaved draft was discarded; no Library clip was added. |
| Physical Bluetooth-to-speaker route change | During a fresh ALL-policy fixture capture, switching Bluetooth headphones to the phone speaker left the foreground service active at 74.630 s. The owner later auditioned the 55.34 s Trim selection spanning that change and confirmed it was clear throughout, without a long gap or distortion. The generated QA draft was discarded without saving. Reconnection timing against the two-minute deadline was not instrumented. |
| Physical two-minute capture bound | A useful-tone fixture capture reached the native limit; the UI timer showed 02:00.01 and Trim showed 02:00.00. The exact stop tolerance around the deadline was not instrumented. |
| API 29 bounded service ENOSPC | Filling only emulator `/data` caused `write failed: ENOSPC (No space left on device)` and service/projection teardown by the first 4 s poll. The 01:59.81 current draft in the returned UI was captured in the pre-fault state, before disk exhaustion. No Save action was taken afterward. The exact reserve/fill files were removed and available space returned to baseline. Library and cache enumeration were unavailable, so neither new Library entries nor partial app-cache output was independently checked. [Pre-fault state](data/device-audio-older-android-20261020/api29-enospc-before.xml); [result](data/device-audio-older-android-20261020/api29-enospc-result.xml). |
| API 36 emulator rapid Stop taps | Two taps completed within 98 ms (first completed at 55 ms); one 51.82 s Trim result followed with no duplicate output, service or projection. The generated draft was discarded. [Screenshot](data/device-audio-regression-20261020/rapid-inapp-stop.png). |
| API 36 emulator rapid Start taps | Two taps completed within 165 ms and produced one Android consent dialog with no foreground service. Cancelling returned to Source; Main retained Quick add Record, empty Pad 1 and `My recording`. No Library clip was saved. |
| API 36 emulator system projection Stop | Tapping the red system sharing chip opened Android's Stop sharing dialog. Confirming Stop sharing returned Play to the no-usable-audio explanation with no service or projection. [Screenshot](data/device-audio-regression-20261020/system-stop-before.png). This emulator control was available; the owner could not locate the corresponding control on Samsung. |
| Microphone regression | Existing mic started and showed a running timer; Home/return stopped/discarded it with the foreground-interruption message. [Active microphone screenshot](data/device-audio-qa/mic-active.png). No new Library clip. |
| File picker cancellation | Existing import opened Android DocumentsUI; Back safely returned to Source. No new clip or draft persisted. |
| Library/board retention and cleanup | Final APK update retained original My recording and the 6.67 s QA clip. Deleted only `device-audio-qa`, clearing its one test assignment. Library returned to its original single clip; original Main Pad 1, empty Pad 2, theme and Library Quick Add preference remained. |
| Quick Add/menu regression | Quick Add retained first-tile bounds `[58,633][284,889]`. Edit mode showed one configuration arrow; normal mode had zero. Original pad overflow and Library actions still opened. [Restored board](data/device-audio-qa/board-restored.png). |
| Final emulator state | Normal Main board, original clip/assignment and Quick Add preference, original display settings, Wi-Fi/data restored to enabled; fixture stopped, projection null, no capture service. |
| Physical Galaxy S24 Ultra result | Play 1.0.16/code 17; Dev 1.0.3/code 4; owner-selected volume 6/15 preserved. The controlled QA clip was saved and later auditioned clearly after cold offline board playback. Permission, notification-channel, projection-cancel and tested lifecycle checks completed; owner-reported source checks and Samsung comparison are detailed in the source table. No private audio export or source URL logging. |

Remaining manual cases include physical OEM checks on Android 29/34, brief
cancellation while stopping/decoding, reverse Bluetooth-route transition timing
against the two-minute limit, file-level acoustic checks under room noise and
injected AudioRecord read failures. The scoped API 29 storage-write failure test
passed; source checks cover only the specific owner-tested clips and versions
listed above, not general YouTube, Shorts, TikTok, Reels or Chrome compatibility. Use the
[reproducible procedure](docs/device-audio-capture-testing.md).

## Permissions / privacy observations

Android audio and notification prompts were contextual to selecting the new
source; projection consent was requested again per session. The system prompt
uses screen-sharing language even though this implementation creates no virtual
display or screen image/video output. Emulator single-app consent was exercised;
whole-device consent was also observed in preliminary capture testing.

Merged artifact inspection confirms RECORD_AUDIO, POST_NOTIFICATIONS,
FOREGROUND_SERVICE and FOREGROUND_SERVICE_MEDIA_PROJECTION, a non-exported
mediaProjection-only capture service and a non-exported consent Activity.
Overlay and broad storage/media-read permissions remain absent. Expo background
microphone recording/playback settings remain disabled. Recordings stay in owned
private temporary/editor/library paths. No upload or active-app/content logging
was added. Physical denial checks covered audio permission, notification
permission and disabled capture channel on the tested phone; broader physical
OEM and consent-mode coverage remains pending.

## Go / No-go recommendation
- Ship as optional source? Further testing needed
- Supported devices/versions: implemented Android API 29+; baseline capture mechanics were exercised on API 29, 34 and 36 emulators. These do not establish physical OEM compatibility below API 36. Partial physical checks were performed on Samsung Galaxy S24 Ultra SM-S928B, Android 16/API 36, build S928BXXS6DZI1.
- Sources empirically confirmed to work: see the controlled fixture and owner-reported clip outcomes in the source compatibility table. Each result is limited to its tested scope; none is a universal app/source claim.
- Sources empirically confirmed not to work: controlled SYSTEM-policy fixture produced the expected restricted/no-usable-audio result in the emulator and on the phone; controlled NONE-policy fixture produced the same expected result on the phone. These policy results do not classify any third-party media app.
- Remaining unknowns: broader source compatibility, reverse Bluetooth-route transition timing against the two-minute limit, physical OEM checks on Android 29/34, brief stopping/decode cancellation and Android AudioRecord read-error handling. The scoped API 29 service ENOSPC path and API 36 rapid Start/Stop/system projection Stop paths are covered; Samsung's system Stop control was not located.
- Next checks: complete the remaining platform and fault cases.
