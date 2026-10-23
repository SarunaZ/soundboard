# Stimmyz Play app

This is the separate Play distribution root for Stimmyz. It has its own Android
application ID (`dev.sarunas.soundboard.play`) and private data sandbox. Its
entrypoint is `index.ts`; it does not mount the Dev app or import the Dev
YouTube authoring flow.

**Library → Import soundbites** copies saved clips from a shared folder created
by the old app's **Export soundbites** action. Audio and names are retained
without re-trimming; existing clips and boards stay in place. Repeated imports
skip existing clip IDs. See the [transfer guide](../docs/soundbite-transfer.md).

The `feat-sound-recording` spike adds **Record device audio** on Android 10+
through a Play-only native playback-capture module. It requests Android audio,
notification and projection consent, continues while switching apps, and stops
from its ongoing notification or the creation screen. Sessions are bounded to
two minutes, use permitted playback only, and feed the existing Trim → Details
→ Save flow. Microphone recording retains its foreground-only behavior.
Silence is rejected; very quiet captures require explicit review. This optional
source requires notifications to be enabled so Stop remains visible. The
October 20 design makes it the primary creation action while keeping microphone
and local import available. Current
physical, API 29/34/36 emulator and JVM evidence, source-compatibility results
and remaining physical OEM/read-error/lifecycle checks are summarized in the
[authoritative test results](../DEVICE_AUDIO_CAPTURE_RESULTS.md); follow the
[test procedure](../docs/device-audio-capture-testing.md) for repeatable checks.

The first slice starts with an empty 16-pad board and an empty Library. The Board
has a measured responsive pad grid, board selector, Edit board controls and a
Quick add tile fixed at the start of the scrolling grid. It is separate from
saved pads, remains visible during search, and never consumes a pad slot. Quick
add remembers device recording, microphone recording, local import or Library;
new eligible users default to device recording. Existing choices survive the
update. The new sound
uses the board's next empty pad or appends after the existing pads. Its action
chevron appears only while Edit board is active; tapping the tile uses the saved
action. Assigned pads play immediately; sound-pad overflow actions are available
from their anchored menus. Quick add and pad menus are positioned against their
trigger controls. The Library includes search, sorting, preview and clip actions.
The six saved palettes are Peach, Mint, Snow, Ice, Vanilla and Coffee, with the
theme picker in the Board header options.

The Editor opens to the **Record device audio** hero with smaller **Record your
voice** and **Import audio or video** cards. Library's main recording action
starts device capture; **More ways to add a sound** opens the device-first source
chooser. Import opens the device picker; microphone recording requests
permission and starts foreground capture. All three methods continue through
Source → Trim → Details. Trim shows player-synchronized waveform progress,
elapsed/total time and Play/Pause with resume and replay. Creation supports
trimming up to 60 seconds, choosing a clip name and built-in
icon/color, then saving to the Play Library and optionally assigning to the
board/pad captured when creation began. Imported and recorded source audio is
limited to five minutes and 32 MiB. Recording requests microphone permission
only after the user chooses microphone recording and uses the foreground UI; leaving
the foreground interrupts and cancels capture. The Details stage has a live pad
preview and fixed Save action. Details offers Default and Gallery, with Gallery
selected initially. Tapping Gallery opens the phone's photo picker. Gallery artwork is
saved as a private JPEG thumbnail up to 512 px for offline Board and Library
display. Saved Library clips retain replacement artwork from Imgflip or the
device gallery. The Imgflip picker uses its free popular list with local name
filtering, not paid full-catalog search.
The [artwork verification record](../docs/play-imgflip-artwork-2026-10-18.md)
documents simulator selection, saved previews and offline restart checks.
In Edit board mode, drag a pad by its grip to reorder it, or tap a pad and then
its destination. Editing controls and selection highlights overlay the existing
board, so toggling edit mode does not move the grid, tiles, labels, search field
or board selector, or change the scroll position. The updated order is saved
on-device and restored after
reopening the app. Reordering changes pad positions within the current board;
cross-board moves, video, share/import from other apps,
manual artwork crop/reposition, full-catalog search, backup/export/import, and restoration of an interrupted
trim/customize draft remain pending. A canceled or interrupted draft is
discarded; already saved clips remain in Library. See the
[visual-fixes record](../docs/play-visual-fixes-2026-10-17.md) and
[recording emulator record](../docs/play-recording-emulator-2026-10-18.md) for
validation and current native-check status.

Dependencies use `app-client`'s Expo 57 base, plus Play-only
`expo-image-manipulator` for bounded artwork thumbnails and
`expo-image-picker` for Gallery artwork, plus `expo-document-picker` for
audio/video file selection. The file picker copies the
selection into its app cache; Play stages a private editor copy, then removes
only that returned DocumentPicker cache file. The user's provider source stays
untouched.

The local `play-native-modules/soundboard-device-audio` Expo Android module is
the sole allowed Play native-module source. The build stages an exact file
allowlist, checks its generated Expo registration and merged service/permission
attributes, and retains the existing extractor exclusions. Run its seven JVM
WAV writer tests with `.\scripts\test-device-audio-native.ps1` from the
repository root; the harness adds an isolated 64 KiB tmpfs check for real ENOSPC
and writer cleanup. Separately, the API 29 emulator service stopped on a real
ENOSPC write failure; Android audio-read failures remain untested. See the
results report for the cache-enumeration limitation.
Native import and cancellation checks are recorded in the
[file-picker verification record](../docs/play-file-picker-2026-10-18.md).

Build an unsigned Android artifact with `.\scripts\build-play-android.ps1` from
the repository root. This directory is not nested under `app-client/src` so its source
root, app identity, and package configuration remain distinct from Dev.

Board, Editor and Library share the approved transparent mint Stimmyz PNG,
packaged locally for offline use. It scales proportionally beside the 48 dp
app-options button. The Board retains its Soundboard subtitle; the S launcher
icon is unchanged. Details offers Default and Gallery, with Gallery selected
initially. The GIPHY demo was removed at the owner's request; see the
[gallery update](../docs/play-gallery-picker-2026-10-22.md).

The clean-rebuild baseline test build is 1.0.15/code 16 for ARM64 and x86_64.
The final APK passed build audits and native clean-rebuild, density, Editor and
Library checks, and was installed with `adb install -r`. It is in
[`data/play-clean-rebuild-final-20261019/artifacts/`](../data/play-clean-rebuild-final-20261019/artifacts/)
with SHA-256 `b1367719f15861e5e8b4f5273e4969a0d272f1cdf5ca55cb715c9912ca0b7aed`.
That baseline passed 72 Play tests and strict TypeScript. See the
[clean-rebuild QA record](../docs/play-clean-rebuild-2026-10-18.md).
The owner confirmed an audible phrase in a physical microphone preview; broader
microphone quality and physical-device playback latency remain unverified.
The device-audio spike uses 1.0.16/code 17; its current artifacts, 79 Play tests,
native tests and remaining physical OEM/lifecycle/read-error checks are recorded in
[`DEVICE_AUDIO_CAPTURE_RESULTS.md`](../DEVICE_AUDIO_CAPTURE_RESULTS.md).
Pad dragging, tap-to-move, restart persistence and background interruption passed
simulator checks; see the [reorder verification record](../docs/play-pad-reorder-2026-10-18.md).
First-use microphone permission, recording through Save and relaunch, and
foreground interruption passed emulator checks. The emulator input is silent by
default, so audible recording quality on a physical phone remains unverified.
See the [recording emulator record](../docs/play-recording-emulator-2026-10-18.md).

Run the data/media tests and TypeScript check with the repository's Docker tools:

```powershell
docker compose --profile tools run --rm --no-deps --entrypoint /bin/sh deps -lc 'corepack enable && yarn workspace app-play test && yarn workspace app-play check'
```

The current visual authority is the [October 22 transparent-logo handoff](../docs/design/StimmyzApp_Astra_Final_Transparent_Logo_Handoff_2026-10-22/BRANDING_WORDMARK_HANDOFF.md),
with its [implementation guide](../docs/design/StimmyzApp_Astra_Final_Transparent_Logo_Handoff_2026-10-22/ASTRA_IMPLEMENTATION.md),
prototype and captured previews. Read the [Trim playback contract](../docs/design/StimmyzApp_Astra_Design_Refined_CTA_Library_2026-10-20/TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md)
for actual-player progress, pause/resume and lifecycle behavior. Earlier design
handoffs and research audits remain historical references. The current changes
and verification are tracked in the [October 22 branding QA record](../docs/play-transparent-branding-2026-10-22.md),
alongside the [October 21 interaction QA record](../docs/play-board-navigation-2026-10-21.md).

Edit Board now saves 3×4/4×4 grids, Pages/Scroll navigation and overlap per board.
Pages reserve their first tile for Quick add; Scroll loads bounded batches with
Quick add only at the top. Pad menus appear only while editing. Playback options
are shared by all assignments of a Library sound and offer volume and repeat.
The local testing build supports protected 0–200% per-sound gain, now reaching
+12 dB at 200%; 100% remains unity. Boosted PCM uses linked-channel limiting
and reconstructed-peak margin; overlap uses protected clip peak bounds. Quiet
clips retain the requested amplification. The 1.0.20/code 21 build passes 145
Play tests, strict TypeScript, 23 native QA cases and 24/24 FFmpeg fixtures.
The build installed on the emulator and the locked Galaxy S23; phone playback
was not tested. See the [amplification QA record](../docs/play-amplification-2026-10-21.md)
for measured results and artifact details.
Android PCM analysis and limiting now run in a native background C++ worker;
the implementation matches the TypeScript algorithm within `2e-6` across the
checked differential cases. Version 1.0.19/code 20 passed dual-ABI build audits
and was installed on the phone with its data preserved. The physical RedSun
retest shows active UI progress within about 0.64–1.16 seconds of the tap,
compared with about five seconds on 1.0.18; this is not acoustic latency.
Broader physical playback QA remains unverified. All 20 emulator playback
checks pass; cold 10–60 second clips reached `source.start()` in 71.6–653.6 ms
across the tested gains. These include engine decode and preparation but do not
measure speaker output. See the [October 22 playback record](../docs/play-playback-fix-2026-10-22.md).
Settings provides master volume, themes and explicit ZIP backup/restore.
Playback progress follows the native audio clock, and contextual Stop all is
available across tabs. Background playback is omitted and stops on leaving the
foreground. Restoring a backup merges owned media and boards and restores app
preferences; existing sound IDs are preserved.
The [first-slice verification record](../docs/play-verification-2026-10-17.md)
contains the passing unsigned APK/AAB build results and artifact checksums.
Local recording/video and reliable creation take priority over further visual
polish; backup/export/import follows in the next priority group. Native build
and device verification are tracked in [STEPS.md](../STEPS.md).
