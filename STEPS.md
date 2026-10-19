# Soundboard — Steps

**Status (authoritative, 2026-10-15):** M0's remote feature path is complete;
its real-phone/cellular exit measurement remains pending. Local authoring L1–L5,
L7, L8 backend live-source smoke, L10, and L11 are implemented and verified. App
strict TypeScript and the service/shared TypeScript build pass; all 59 app tests,
all 4 Worker tests, and all 6 service tests pass (69 total). The
all-ABI arm64+x86_64 debug APK is built and installed on the Android 36 emulator.
L6 saved-file playback is verified on that emulator with the API/worker stopped
and Wi-Fi/mobile data off;
its debug JS still came over USB Metro, so standalone offline launch is not
verified. L9 physical-phone interaction and live-source in-app save checks
remain pending. The superseded whole-file device import passed emulator checks:
a Downloads MP3 retained
identical source bytes, survived an online force-stop/relaunch, and played from
pad 14. Deleting only the synthetic Library copy removed that private file and
restored pad 14's default; the original Downloads source and existing user
clip/pad 16 assignment stayed unchanged. Picker cancellation and invalid/overlong
files left the catalog unchanged. Native verification for that old import flow
covered MP3 only. The local
board lifecycle passed replacement, removal to the
default, re-add, and assignment restoration after an online force-stop/restart
via USB Metro. After JS loaded, a local clip played with an active AudioFlinger
track matching the app PID with API/worker stopped and airplane mode on with
Wi-Fi off; its SHA-256 stayed unchanged. A cold offline start failed because
the development client could not load its JS bundle, so standalone offline
launch is not verified. This is not a physical-phone claim. Follow the L-series
below for current work. The numbered 1–27
remote pipeline remains historical/deferred; its open items are not completed
by this pivot. Local board assignments (L11) and search/naming/capacity UI
(L13) are implemented and verified. L12 records a superseded whole-file device
import; L14's corrected device-file Editor flow is implemented and emulator-
verified with MP3. M4A/WAV/AAC and physical-phone checks remain pending.
**Date:** 2026-08-15, revised 2026-10-15
**Reads with:** [DESIGN.md](DESIGN.md) (the *why*) · [PLAN.md](PLAN.md) (the *order* and the reasoning behind it).
This file is the short checklist — the flat list of what to actually do next.

This folder is the monorepo root: `shared/`, `service/` and `app-client/` live here
(PLAN §1 calls the app `app/`; it is `app-client/` on disk).

Everything is in one repo — [SarunaZ/soundboard](https://github.com/SarunaZ/soundboard) —
so a plain clone builds:

```
git clone https://github.com/SarunaZ/soundboard.git
```

It is **public** (DESIGN §11 notes the yt-dlp path breaches YouTube ToS, so the
repo being public is a deliberate, accepted trade). Branch is `master`.

*`app-client/` was a submodule until 2026-08-22, which made every app edit two
commits; it is now a plain directory and the separate `soundboard-app-client`
repo is no longer used. On an older clone: `rm -rf app-client` then `git pull`.*

**Docker is the only prerequisite.** No Node, Yarn, corepack, JDK or Android SDK
is needed to build. `.\sb.ps1 build` (or `./sb.sh build`) does everything:
dependencies, service image, APK. See `sb.ps1 help` for the rest.

---

## Current local-authoring sequence (L-series)

These identifiers are separate from historical steps 1–27. Keep every item
pending until implementation and the stated acceptance check are confirmed.

- [x] **L1 — Temporary editor API boundary.** Published the Docker API on host
  loopback port 8080 for USB development. Keep `/health` independent and
  unauthenticated; require the `EDITOR_TOKEN` bearer token on every `/editor`
  endpoint. Configure the ignored `app-client/.env.local` with
  `EXPO_PUBLIC_EDITOR_API_URL` and `EXPO_PUBLIC_EDITOR_TOKEN`, using the same
  token value as the service. It is a personal token embedded in the app build,
  not production auth. For USB, run `adb reverse tcp:8080 tcp:8080` and set the
  URL to `http://127.0.0.1:8080`; keep Metro's `adb reverse tcp:8081 tcp:8081`.
  Never expose this loopback binding publicly; use HTTPS for a remote private
  endpoint.
- [x] **L2 — Temporary source and preview.** Accept a YouTube URL in the Android
  flow, allow sources up to 20 minutes, provide preview audio, and expire server
  temporary files with TTL cleanup. Do not create a persistent server output
  library or write to R2. Handle YouTube restrictions without login/bot/access
  bypass. Verified with the deterministic fake-source flow; the backend
  live-source smoke is recorded in L8.
- [x] **L3 — In-app range editor.** Displayed the source waveform with two
  draggable handles and previewed the selected range in the emulator. Selection
  is capped at 60 seconds.
- [x] **L4 — Render the selection.** Rendered the selected range into a real
  `.m4a` and verified range changes invalidate the old render before rerender.
  The selected clip metadata is 1477 ms; ffprobe reports 1.478 s after codec
  rounding. Service tests also cover range, auth, error, cleanup, and AAC mono
  44.1 kHz output.
- [x] **L5 — Private local library.** Saved the rendered clip and catalog entry
  under `Paths.document/local-clips` after naming the clip. It is app-private,
  removed by Android uninstall, and is not Downloads or automatic cloud backup.
  Offline playback/restart verification is tracked in L6.
- [x] **L6 — Offline local playback.** Verified on the Android 36 emulator:
  after force-stop/restart, the saved clip remained in the local catalog and
  played with API/worker containers stopped, airplane mode on, Wi-Fi off, and
  mobile data off. Native MediaSession reported `PLAYING` with no error and
  AudioFlinger showed an active mono 44.1 kHz app track; playback stopped after
  about 1.487 s. The copied saved file probes as AAC mono 44.1 kHz, 1.478 s,
  matching its 1477 ms metadata. The debug JS bundle was still served over USB
  Metro; this verifies local file audio without the API/cloud, not a standalone
  offline app launch, real phone, or audible listening. It does not mark the
  remote cache ladder done.
- [x] **L7 — Deterministic fixture and API checks.** Verified the fake fixture
  flow through app import, preview, range selection, render, and local save. All
  34 app tests, 4 Worker tests, and 6 service tests pass. The service
  suite covers fake YouTube plus real ffmpeg rendering, retry after partial
  download, service-side active cancellation and cleanup, HTTP Range 206, and AAC mono
  44.1 kHz trim duration. App-level cancel/error cleanup with no partial local
  file is not yet verified; keep that check in L9.
- [x] **L8 — Backend live source smoke.** Using the existing API/worker and
  official yt-dlp/FFmpeg path, imported watch-plus-playlist video
  `OjNpRbNdR7E` and Shorts video `jlPQtJXy9t8` without cookies or access
  bypass. Both produced a ready source and a ranged preview (HTTP 206); each
  rendered a 2-second clip. This verifies backend source compatibility only;
  the live-source in-app save flow remains pending in L9.
- [ ] **L9 — Physical-phone interaction check.** On a physical Android phone,
  use a live permitted source, drag both handles, preview the range, save it,
  restart the app, then play it in airplane mode without the service. Confirm
  cancel/error paths leave no partial files. Pending.
- [x] **L10 — Native build refresh.** Rebuilt the all-ABI arm64+x86_64 debug
  APK with the `expo-audio` native dependency and installed it on the Android
  36 emulator. If the ignored `app-client/android` directory needs regeneration
  later, use normal Expo prebuild without a clean wipe. Keep Metro's 8081 reverse
  and the API's 8080 reverse configured for USB development.
- [x] **L11 — Local board assignments.** Implemented and verified.
  From the Library, **Add to board** can append a sound as a new board slot or
  open a numbered picker for the original 16 pads, asking before replacing an
  existing assignment. The board stores a persistent local clip-ID-to-slot
  mapping; assigned local clips play offline independently of the remote API.
  Removing an assignment restores the original remote or bundled pad; replacing
  it selects another local clip. Deleting a library
  clip clears all its assignments, and missing local clips fall back to the pad
  default. The six local board model tests and app strict TypeScript check pass.
  On the emulator, replacement at pad 16 persisted in `board.json`;
  Edit Board → local pad → Remove restored the default and cleared the mapping;
  re-adding wrote the assignment again. An online force-stop/restart via USB
  Metro restored pad 16. After JS loaded, playback worked with API/worker stopped
  and airplane mode on with Wi-Fi off; AudioFlinger showed an active track
  matching app PID 7315. The clip's SHA-256 was unchanged. A cold offline launch
  failed because the development client could not load its JS bundle, so this
  does not verify standalone offline launch. File integration tests cover
  duplicate deletion-hook behavior and failed-write preservation; the actual
  user clip was not deleted on-device. Local files remain private, and no R2
  writes occur. Physical-phone interaction remains pending.
- [x] **L12 — Historical: whole-file import from device (superseded by L14).**
  This former Library flow was implemented and emulator-verified with MP3; it
  copied the full file rather than opening it in the Editor. Preserve the checks
  below as history only. Current directions require device audio to be trimmed
  in the Editor before saving a new Library clip.
  Use the Expo SDK 57 system picker to import MP3, M4A, WAV, or AAC files up
  to 60 seconds and 10 MiB. Import the whole file without trimming, transcoding,
  or server/R2 upload. Copy it into the private library under a UUID filename
  with the correct extension, preserve the source, and use a filename-derived
  title when available or `Imported sound` as the fallback. Imported clips can
  be assigned to board pads. No APK rebuild or broad storage permission is
  needed; an absent extension uses the legacy `.m4a` default.

  The 34 app tests and strict TypeScript check pass. In the native smoke, picker
  cancellation left the catalog unchanged. An MP3 selected from Android
  Downloads imported via content URI as `soundboard-import-test`; its 366 ms
  duration and `.mp3` extension were retained, and the private 3,042-byte copy
  had the same SHA-256 as the untouched source. It assigned to pad 14 and board
  playback produced a successful metric. A 61-second MP3 was rejected with the
  60-second limit message; a damaged PNG disguised as MP3 was rejected with a
  decode error. Both left the catalog unchanged and created no extra audio or
  staging files. The imported synthetic clip survived online force-stop/relaunch
  and played from pad 14. Deleting only that private copy removed its file and
  restored pad 14's default; the original Downloads source's SHA-256 remained
  unchanged, as did the existing user clip and pad 16 assignment. Native import
  verification covered MP3 only, not M4A/WAV/AAC. This is emulator validation,
  not physical-phone validation; a fully offline cold launch is not verified.

- [x] **L13 — Search, naming, and 1,000-soundbite library.** Implemented and
  verified. The 53-test suite and strict TypeScript check pass. Native checks verified
  importing a synthetic MP3 as a new sound on pad 17 (17/1,000), preserving the
  existing user clip and pad 16, and finding the imported sound with a
  case-insensitive board search. A blank rename showed required-name feedback
  and disabled Save; renaming to “Native bell” updated the Library search and
  pad 17 label, including after an online force-stop/relaunch. The imported
  private MP3 hash matched its source, and the existing user clip hash stayed
  unchanged. Search, clear-search, append, rename, and removal of the filtered
  board result were verified natively; removal cleared only the appended pad 17
  slot, leaving original pad 16 and the Library clip intact. Deleting only the
  synthetic Library copy removed its private audio and restored the catalog to
  the existing user clip; the Downloads source hash stayed unchanged. The
  earlier L11 checks cover replacement of an original pad. Automated tests
  cover the 1,000-item limit; native stress at capacity was not performed. The
  Editor name field has been reviewed and type-checked, but no new YouTube
  render/save flow was run on-device. The local
  library and board support up to 1,000 soundbites. Search matches names
  case-insensitively while preserving library and board order. The board keeps
  its first 16 remote or bundled defaults, can append a local sound as the next
  board slot, and can assign or replace clips on those original pads. Library
  rename changes catalog metadata only, so assigned board labels refresh without
  changing audio files. The Editor shows the soundbite name before render/save
  actions, limits it to 100 characters, and requires a nonblank name to save.
  Physical-phone checks remain pending under L9.

- [x] **L14 — Edit a device audio file locally.** Open MP3, M4A, WAV, or AAC in
  the Editor from the device picker. Enforce a 5-minute source-duration limit
  and 32 MiB file-size limit. Decode PCM fully on-device, display a waveform
  with range handles, cap the selected range at 60 seconds, and render a PCM16
  WAV preview. Require a name, save the selected render to the private Library,
  then allow **Add to board**. Leave the original file untouched; do not call
  YouTube or the temporary service and do not upload the source or render.
  Clean up only app-owned temporary cache files. Keep the 1,000-soundbite limit.
  Implemented and emulator-verified with MP3. The 59 app tests, 4 Worker tests,
  and 6 service tests pass; strict TypeScript passes. On Android 36, a 61.07 s
  MP3 source opened, demonstrating the new duration limit exceeds L12's former
  60 s cap. Selecting 1–5 s rendered and saved a named PCM16 mono 44.1 kHz WAV:
  352,844 bytes total (352,800 PCM data bytes), with 4,000 ms catalog duration.
  The rendered preview produced an active AudioFlinger track matching the app
  PID. **Add to board** appended it to pad 17 without replacing pad 16; after an
  online force-stop/relaunch, the assignment remained and board playback again
  produced an active app track. Opening a short MP3 then unmounting cleared the
  app-owned temporary cache. The original 61.07 s source SHA-256, existing user
  clip SHA-256, and pad 16 assignment stayed unchanged. Deleting only the
  synthetic WAV through the Library cleared pad 17 and restored the prior
  catalog. Native verification covered MP3 only; M4A/WAV/AAC and physical-phone
  checks remain pending. This flow has not been verified with the service
  stopped or offline. No claim is made here for those conditions.

- [ ] **L15 — Opt-in native YouTube prototype.** Build the isolated Android
  variant described in [docs/android-youtube-prototype.md](docs/android-youtube-prototype.md).
  The ordinary build must keep the disabled module stub and omit downloader
  artifacts. The isolated ARM64 APK builds, aligns, and verifies successfully;
  its size and signature are recorded in the linked verification notes. The
  ordinary disabled-stub compile and dependency-isolation check also pass. The
  initial APK was installed and launched on a Samsung phone and the prototype
  button appeared, but extraction failed with a generic error. The earlier
  safe-diagnostics rebuild built, verified, passed four native unit tests, and
  is installed and launched successfully. Its retry recorded
  `ERR_SBYT_DOWNLOAD_EXTRACTOR`, confirming metadata completed and download
  failed. The expanded finite categorization build also builds, verifies, passes
  seven native tests, and is installed/launched; its retry recorded the same
  download-stage code. The bounded report revision builds, passes seven
  classifier plus seven report tests, and is installed/launched. Its report was
  timestamped 16:09:59 local and retrieved over USB at 16:10:27 local:
  `DOWNLOAD`,
  `ERR_SBYT_DOWNLOAD_EXTRACTOR`, `YoutubeDLException: ERROR: 'NoneType' object
  has no attribute 'lower'`. An offline reproduction with the exact cached
  yt-dlp 2025.11.12 AAR and synthetic empty fixture points strongly to the
  wrapper's truthy missing `--ffmpeg-location` path reaching the `m4a_dash`
  default fixup; this does not prove the phone's exact container state/call
  trace. A separate offline full `process_info` comparison reproduces the same
  failure with the default fixup path and returns with `--fixup never`; this is
  not phone extraction. The approved prototype-only change is implemented in
  the request factory. All 16 native tests, 79 app tests, TypeScript, and normal
  config equality checks pass. The compatibility APK is built and verified:
  42,155,634 bytes, SHA-256
  `896D759A369587766B98B4A12B5BE3F6C7F27A097E6EDDF3136088C2164DB9EF`, valid
  v2 signature matching the prior certificate, prototype package, ARM64, SDK
  24/36, unchanged permissions, and non-debuggable. Its embedded bundle is
  1,457,444 bytes; Python and QuickJS are present. The APK includes
  `libavcodec`, `libavformat`, `libavutil`, and `libswresample` from
  react-native-audio-api 0.13.2; it does not bundle the FFmpeg CLI/downloader
  converter. 16 KiB zipalign plus all 22 ARM64 ELF alignment checks pass.
  `adb install -r` returned `Success`. Launching at 16:39:44 local returned `Status: ok` (PID
  28603); scoped startup logs show the main activity running without
  `SoundboardYoutube` or `AndroidRuntime` errors, with only a `SafeAreaView`
  deprecation warning. Both prototype and ordinary packages are present for
  user 0; neither was uninstalled or data-cleared. L15 remains open; phone
  extraction, decoding, editing, and playback are unverified. On 2026-10-12,
  the user reported that the prototype works; this report is not independent
  extraction evidence. Keep L15 open for cancellation, long-source, unavailable-
  module, and offline checks unless each is confirmed separately. See linked
  notes for the remaining checks.
- [ ] **L16 — Private YouTube sideload release and playback progress.** The
  private release profile uses Android package ID
  `dev.sarunas.soundboard.sideload` and starts with an
  empty local Library; the ordinary and prototype build profiles remain
  unchanged. Its Editor primary action routes to on-device extraction, and the
  waveform shows the audio player's actual position and elapsed/selected
  duration. The board shows progress from its playback clock. These UI and
  playback changes are implemented. The combined app suite, including the
  private release profile, passes 101/101 tests; the TypeScript check passes.
  The build helper uses the existing ignored `node_modules` cache through a
  direct read-write mount, avoiding a 6.6 GB copy. The unsigned build from
  2026-10-12 is retained at 42,151,722 bytes with SHA-256
  `057A75BC926BFC7B37F2CDF389395CC8C315A88897A9F6B09EEA1548CBF08395`.
  The signed APK was verified on 2026-10-15: 42,282,441 bytes, SHA-256
  `DAB85ACCDF8611D0CB27C504E8FE9F053336B6660D4A821C3CB2320EAC424004`,
  matching `SHA256-SIGNED.txt`. `apksigner` verified v2/v3 signatures and a
  non-debug RSA-3072 certificate (SHA-256
  `467f0fa1246038a1ed190d71c427923e344c5a16611349e7acf43ab281320571`).
  Binary inspection reports package `dev.sarunas.soundboard.sideload`, version
  `1.0.0` (code 1), min SDK 24, target SDK 36, ARM64 only, non-debuggable,
  `allowBackup=false`, `usesCleartextTraffic=false`, and
  `extractNativeLibs=true`. APK zipalign's 16 KiB check passed. On 2026-10-15,
  the signed APK was freshly installed for user 0 on a Samsung SM-S928B
  (ARM64, API 36); installation returned `Success` without replacing,
  uninstalling, or clearing data. A cold launch returned `Status: ok` in
  198 ms. Startup logs showed no AndroidRuntime crash and a SafeAreaView
  deprecation warning. The configured manifest hostname failed DNS resolution
  on the phone; the PC resolved it, but the cause is unconfirmed and no network
  settings were changed. Audio playback/progress, import, cancellation, offline
  behavior, upgrade, and dependency/notice inventory remain pending. The user
  reports the encrypted signing-key backup is saved in NordPass; that backup
  was not independently verified. Keep L16 open; this is not a
  production-readiness or cleared-handoff claim. See
  [docs/private-android-release.md](docs/private-android-release.md).

- [ ] **L17 — Keyboard-safe clip naming.** The Editor name field and Library
  rename field have keyboard-avoidance and focused-input reveal handling for
  Android and iOS. The fix bounds scrolling to the available viewport and
  measures the focused input against the actual visible area. It handles an
  already-open keyboard, cleans up blur/hide/unmount and stale measurements,
  resets state on modal reopen, and dismisses from the Editor's Done action.
  Physical Android and iOS UI checks have not been run. The combined app suite
  passes 112/112 tests and the TypeScript check passes; no native processing,
  data format, or dependency changes were made. The replacement private build
  was signed on 2026-10-15 at version `1.0.1` (version code `2`) for the same
  package ID and signing identity. `adb install -r --user 0` succeeded on the
  Samsung SM-S928B. The original `firstInstallTime` and `ceDataInode` were
  unchanged, but saved-clip contents were not independently compared or tested.
  A cold launch returned `Status: ok` in 160 ms. Scoped startup logs showed only
  a SafeAreaView deprecation warning and no AndroidRuntime error; no manifest
  DNS warning appeared in that sample, which does not establish that the prior
  DNS issue is resolved. Physical-phone keyboard checks and saved-clip
  acceptance remain pending. Keep L17 open until those checks pass.
  See
  [docs/private-android-release.md](docs/private-android-release.md).

- [x] **L18 — Board ordering and system navigation insets.** Persistent visual
  ordering moves original and local pads without changing their assignment
  slots. Edit mode supports drag handles, edge scrolling, tap-source then
  tap-destination, and earlier/later controls; removal is a separate action.
  Native safe-area insets protect all three screens and the shared footer.
  The app suite passes 124/124 tests, TypeScript passes, and the release build
  passes 16/16 native tests. Tests cover legacy snapshots, duplicate clips,
  missing slots, the 1,000-slot limit, restart, and backup/write failures.
  Signed version `1.0.3` (code `4`) was installed as an update on the connected
  Galaxy S23 (SM-S911B) on 2026-10-16 with the same package and certificate;
  its data inode and first-install time were unchanged. Dragging, tap-to-move,
  force-stop/relaunch persistence, and footer clearance on Board, Editor, and
  Library were verified on that phone. All 16 pads were restored to the
  captured pre-test order. Long-board edge scrolling, rotation, gesture-mode
  navigation, and iOS were not verified on devices; this does not close
  L16/L17's other acceptance items.

## Design refresh (D-series, implementation started 2026-10-17)

Source: [Stimmyz design implementation plan](docs/stimmyz-design-plan.md).
The imported design bundle and repository audit are complete. Implementation
has started in the separate `app-play/` workspace. All milestones remain open
until their full acceptance checks pass; they do not close the L-series checks.

The first slice includes named empty boards, persisted active selection and
themes, private Play catalog/audio, snapshot recovery, Board/Editor/Library UI,
local-file trim/preview/Fine tune, foreground microphone recording, icon/color/name
customization and save/assign with retry. Imported and recorded sources are
limited to five minutes and 32 MiB; trim selections are limited to 60 seconds.
Microphone permission is Play-specific and requested contextually. Play has its
own package `dev.sarunas.soundboard.play`, verified test build version
1.0.15/code 16, and starts with no Dev clips, remote defaults or prototype
artwork. Cross-board move UI, advanced draft restoration, local video (P0), media
share (P1), and backup/export/import (P1) remain pending.

Verification update (2026-10-18): 48 Play tests, nine staging/plugin tests, five
shared reorder-geometry tests, and
the Play TypeScript check pass. The current unsigned native test build covers
ARM64 and x86_64. Emulator checks passed first-use microphone permission,
recording through Save and relaunch, and foreground interruption. The emulator
audio input is silent by default; physical-phone microphone quality remains
unverified. No phone installation, audible-recording result, or store release is
claimed. See the [recording emulator record](docs/play-recording-emulator-2026-10-18.md)
for the workflow and remaining checks. Earlier packaging checks and artifact
details are in [Play first-slice verification](docs/play-verification-2026-10-17.md).

Verification update (2026-10-19): all 72 Play tests and strict TypeScript pass.
The final ARM64+x86_64 APK/AAB passed build audits; the signed testing APK
passed v2/v3 signature and 16 KiB alignment checks and was installed on the
emulator. Native density 420/400, Editor and Library checks passed. The APK and
SHA-256 are recorded in the [clean-rebuild QA record](docs/play-clean-rebuild-2026-10-18.md).

- [ ] **D1 — Parallel Dev/Play roots and packaging.** Dev `app-client/index.ts`
  still enters `./App`; Play has `app-play/index.ts`, a separate package and
  stage scripts. The Play package `dev.sarunas.soundboard.play` has a current
  verified 1.0.15/code 16 ARM64+x86_64 test build. Play owns exact copies of the
  Dev source's S launcher assets. Stage and plugin checks pass;
  emulator recording, save/relaunch and interruption checks passed. D1 remains
  open for separate on-device data verification and remaining artifact gates.
  See the [first-slice verification record](docs/play-verification-2026-10-17.md),
  [visual-fixes record](docs/play-visual-fixes-2026-10-17.md), and
  [recording emulator record](docs/play-recording-emulator-2026-10-18.md).
- [ ] **D2 — Play board/catalog foundations.** Implemented named boards, empty
  pad semantics, persisted active selection, private catalog/audio and snapshot
  recovery. In-board reorder preserves whole pad records and persists via the
  existing snapshots; see the [native reorder checks](docs/play-pad-reorder-2026-10-18.md).
  Finish cross-board move UI and retention actions. Keep Dev
  storage/defaults intact; use v1 snapshots as compatibility fixtures only, with
  no real Dev-to-Play migration.
- [ ] **D3 — Play presentation.** Board, Editor and Library screens use the six
  clean-rebuild palettes. The [visual-fixes record](docs/play-visual-fixes-2026-10-17.md)
  and [native follow-ups](docs/play-recording-emulator-2026-10-18.md) include the
  user's edit-only Quick add arrow preference, verified in simulator 1.0.4.
  The earlier visual-fixes record
  covers the measured responsive Board grid, Quick add preference, board and
  pad controls, navigation selection, creation progress and Fine tune layout,
  and Library sorting/menus. Edit mode now supports grip dragging, edge scrolling
  and tap-to-move; native drag, tap and restart persistence checks passed.
  Version 1.0.6 overlays edit controls with no layout shift; normal and scrolled
  large-text bounds matched, and filtered dragging passed. See the
  [native edit-layout checks](docs/play-edit-geometry-2026-10-18.md). Version
  1.0.7/code 8 also limits saved-pad menus to Edit board; normal/edit/Done menu
  visibility and unchanged label bounds passed simulator checks.
  Version 1.0.9/code 10 enlarges the Board wordmark from 23 to 32 sp to match
  the reviewed prototype. Normal and 360 dp/font 1.5 simulator checks passed;
  toggling edit preserved header and shared text bounds.
  Version 1.0.13/code 14 makes Quick add a fixed first grid tile outside stored
  pads. Board-only additions fill an empty pad or append to a full board;
  real-pad dragging and tap-to-move account for the leading action tile.
  Tests, TypeScript, native save/Library/drag/search/restart and unchanged edit
  geometry checks passed; see the [fixed Quick add record](docs/play-pinned-quick-add-2026-10-18.md).
  Version 1.0.14/code 15 used a sun icon for Appearance and four numbered Editor
  introduction steps. TypeScript and normal/compact large-text native checks
  passed; see the [historical visual record](docs/play-appearance-editor-2026-10-18.md).
  The current visual authority is [Stimmyz Astra Clean Rebuild](docs/design/StimmyzApp_Astra_Clean_Rebuild_2026-10-18/DESIGN_SOURCE_OF_TRUTH.md).
  Verified build 1.0.15/code 16 includes six persisted palettes
  (Peach, Mint, Snow, Ice, Vanilla, Coffee), header theme options, always-available
  anchored sound-pad overflow menus, Record in Quick add preferences, anchored
  Quick add/pad actions, the direct dashed Editor source card, Source → Trim →
  Details, and saved-clip gallery artwork changes. The 72 Play tests and strict
  TypeScript check pass. Native clean-rebuild, density 420/400, Editor and
  Library checks pass on the emulator. The final signed testing APK is installed
  and recorded in [docs/play-clean-rebuild-2026-10-18.md](docs/play-clean-rebuild-2026-10-18.md);
  physical-device checks remain open.
  Cross-board move controls remain open. Do not redesign Dev screens.
- [ ] **D4 — Play creation.** Implemented local-file trim/preview/Fine tune,
  foreground recording, name/icon/color customization, save/assign and retry.
  Version 1.0.10/code 11 fixes Choose file with `expo-document-picker` and
  explicit private file staging. TypeScript and 27 media/recording tests pass;
  native MP3 import, cancellation with draft preservation, invalid-file errors
  and Quick add's Choose file path passed. See the
  [file-picker record](docs/play-file-picker-2026-10-18.md).
  Version 1.0.11/code 12 renames artwork actions to Choose image/Change image;
  TypeScript and native checks of both labels passed. The open draft was
  discarded with the user's explicit approval before the simulator update.
  Editor now exposes direct Choose file and Record sound buttons. Version 1.0.3
  was installed in the simulator: Record started a capture directly and Stop
  opened a 7.26-second Trim source; file-picker cancellation and large-text
  visibility passed. Existing saved clips were preserved.
  Recording follows Source → Trim → Customize → Save, requests microphone
  permission contextually, and passed emulator first-use, save/relaunch and
  foreground-interruption checks. The [visual-fixes record](docs/play-visual-fixes-2026-10-17.md)
  describes Source → Trim → Customize progress, scaled Fine tune layout and live
  pad preview. Small-screen device checks and resilient draft restoration remain
  open; cancellation/interruption discards the draft. See the
  [recording emulator record](docs/play-recording-emulator-2026-10-18.md).
- [ ] **D5 — Play local artwork.** Icon/color presentation and optional Imgflip
  thumbnail storage with missing-image fallback exist. Gallery import and saved
  clip artwork replacement from gallery or Imgflip are implemented; manual
  crop/reposition remains open. TypeScript, gallery/offline-storage tests, and
  clean-rebuild native simulator QA pass. No Dev UI.
- [ ] **D6 — Play native sources.** Microphone recording is implemented with
  foreground capture and passed emulator first-use permission, save/relaunch and
  interruption checks. Source is capped at five minutes and 32 MiB; selected
  trim is capped at 60 seconds. Physical-phone microphone behavior is pending
  because emulator input is silent by default. P0 local video and P1 Android
  shared-media import remain open. Keep microphone permission Play-specific and
  Dev's current permission policy unchanged. See the
  [recording emulator record](docs/play-recording-emulator-2026-10-18.md).
- [ ] **D7 — Dev/Play integration and public-test gates.** Verify Dev UI, YouTube,
  data and playback remain intact; Play offline launch, capacity, accessibility,
  playback, separate sandboxes/coinstallation and extractor-free artifacts.
  Build-level artifact checks are recorded; physical/device checks remain open.
  Before any public test, verify current primary policy sources, inventory Dev/Play media
  and rights provenance, and reconcile actual SDK/network/microphone behavior
  with Play Data Safety and the privacy policy. Research audit claims are prompts
  for verification, not legal conclusions.
- [ ] **D8 — Play online artwork (P2).** User selected Imgflip's free popular list.
  Local name filtering, source links, bounded private thumbnails and optional
  Customize selection are implemented. 58 Play tests, TypeScript and 9 build
  checks pass; simulator selection, save, offline restart and stable edit bounds
  passed. See the [artwork record](docs/play-imgflip-artwork-2026-10-18.md).
  Full-catalog search and manual crop/reposition remain open. No API key is used;
  no unreviewed Dev sounds or prototype media are
  Play defaults. Public packs/sharing also require rights and moderation decisions.
- [ ] **D9 — Play backup/export/import (P1).** Add bounded, validated archives
  for Play boards, metadata and owned media; handle conflicts, duplicates,
  corruption, cancellation and interrupted writes without touching Dev data.

## Historical remote pipeline roadmap (steps 1–27)

The following checklist records prior implementation history and the deferred
remote-ingest plan. It is not the active local-authoring sequence. M0 history and
its real-phone/cellular measurement remain as recorded; open remote items remain
open and are not implied complete by L1–L11.

## Setup — day one

Prove both native toolchains before any product code depends on them (PLAN §4, R4).

- [x] 1. **Toolchain — done, by a different route than planned.** No Android Studio
  was needed for building: `app-client/Dockerfile.android` holds the JDK, SDK 36
  and NDK 27, and `sb apk` produces the APK from a bare checkout. Verified with
  `libreact-native-audio-api.so` and `liboboe.so` in the APK.
  *Android Studio was later installed anyway, but only for its emulator* — an
  emulator needs KVM/WHPX and a GPU surface, so it cannot run in a container.
  SDK lives at `C:\Users\Sarunas\Android\Sdk` (**not** under `AppData\Local`,
  which is redirected into a package container).
  **Still unmet:** the planned exit was a real phone over USB. The emulator
  cannot tell you anything about DESIGN §6 radio-wake latency.
- [x] 2. **R2 read path — done.** A private bucket is exposed through the
  `soundboard-media` Cloudflare Worker, with
  `Cache-Control: public, max-age=31536000, immutable`. A hand-uploaded clip
  plays from an Android phone's browser. The client never receives R2 API
  credentials or an R2 bucket endpoint.
- [x] 3. **Remote native playback — done.** `react-native-audio-api` plays the
  Worker-backed clip in the Android emulator. That original single-clip smoke
  test has been superseded by step 6's manifest loader. The current public
  manifest URL comes from ignored `app-client/.env.local` as
  `EXPO_PUBLIC_MANIFEST_URL`; Git contains a safe public example and no R2
  credentials.

  Launch preloading fetches and decodes configured remote pads before enabling
  them. After clearing app data, the original first press measured **1191 ms
  cold**; with preloading, the first enabled press measured **43 ms warm**
  (**3 ms** on the immediate retrigger). These emulator/wifi numbers prove the
  path only. They do not satisfy the real-phone/cellular baseline required by
  R6 or complete M5 step 26.
- [ ] 4. Droplet: 2 GB swap + `systemd MemoryMax=` on both units — **before the first ffmpeg run**, so the OOM killer can't pick imli's Mongo (§7, R1).
  *Partial:* `docker-compose.yml` sets `mem_limit` (api 192m, worker 384m), which
  is this stack's version of `MemoryMax`. The droplet itself is untouched — no
  swap, nothing deployed.
- [x] 5. Monorepo skeleton: `shared/` · `service/` · `app-client/`. Yarn 4 workspaces via corepack, `nodeLinker: node-modules`.

### Also built, not in the original plan
- `docker-compose.yml`: `api` + `worker` (service), `deps` + `metro` (tools), `apk` (android).
- `sb.ps1` / `sb.sh`: Docker-only task runner. `build` does dependencies + service image + APK.
- AVD `soundboard` (Pixel 6, Android 36, x86_64). Boot it **from the SDK's own
  `emulator/` directory** — launched by absolute path from elsewhere it cannot
  find its engine binaries. Then `adb reverse tcp:8081 tcp:8081` to reach Metro
  running in Docker. **`sb apk` alone will not run on it:** the default APK is
  arm64-only, so SoLoader cannot find its libraries on x86_64 and the app dies
  in `MainApplication.onCreate` before any JS runs — looking exactly like a JS
  crash and costing an hour if you read it that way. Use `sb apk --all-abis`.
- Git: one public repo (above). `.env`, `node_modules` and `app-client/android` are all untracked;
  verified by cloning fresh and listing what shipped.
- The `apk` service runs `expo prebuild` when `app-client/android` is absent, so
  a bare checkout still builds — that directory is gitignored by design (CNG).

## M0 — Playback shell *(no server code at all)*

- [x] 6. **Initial clip set + manifest — done.** Five source MP3s were normalized
  to AAC-LC, mono, 44.1 kHz, 64 kbps; named 1–5; uploaded to private R2 under
  content-addressed `clips/<sha256>.m4a` keys; and described by immutable
  `manifest/v1.json`. The public Worker exposes only versioned manifests and
  clip keys, with byte-range support and immutable cache headers.

  The app fetches and validates the untrusted manifest, maps its five pinned
  entries into frozen grid positions 0–4, constructs Worker URLs from
  `baseUrl + clipKey`, and preloads/decodes all five before enabling them. The
  remaining 11 pads stay bundled comparison tones. Verified with validator
  tests, strict TypeScript, all five live Worker objects, an all-ABI APK, and the
  Android 36 x86_64 emulator on 2026-09-11. All five remote pads scheduled warm
  at **37, 15, 16, 16 and 17 ms**, with a metric buffered for every tap.
  **Still unmet:** the same run on a real phone over cellular, which is the M0
  exit rather than part of the seed itself.
- [x] 7. **4×4 pad grid + engine — done.** `app-client/src/audio/engine.ts` implements
  §8 as written: `onPressIn`, monophonic with an 8 ms fade on the outgoing voice,
  a gain node per voice, a fresh `AudioBufferSourceNode` per retrigger, LRU of 30
  buffers, no debouncing, plus concurrent-decode dedup so spamming a cold pad
  cannot start N decodes.
  *Measured on the emulator:* **246 ms cold, 11 ms warm** — read at the time as
  §6's bimodal split. **It is not** (step 8 reconciles it): with bundled tones
  there is no network in the path, so no cold/warm network split can exist yet.
  246 ms was a first-tap-of-session, which constructs the AudioContext.
  *Current audio:* pads 1–5 come from the configured Worker manifest; the other
  11 pads are bundled AAC tones (mono/44.1k/64k per #14). The engine takes a URI
  either way.
  *Library workaround:* the package root pulls in `AudioControls`, which imports
  `react-native-gesture-handler` and `react-native-reanimated` (neither a declared
  peer dep), so the engine deep-imports `lib/module/core/AudioContext`. The ambient
  declaration must use a plain `import`, not `import type` — otherwise
  `typeof AudioContext` silently resolves to the DOM one.
- [x] 8. **Instrumentation — done, running on the emulator.** `app-client/src/metrics/`
  records one sample per tap: `pressToScheduledMs`, `cacheHit`, `sameAsPrevious`,
  `idleMs`, connection type + cellular generation, session id, and `ok`. Buffered
  in memory; flushed at 25 samples, every 30 s, and on backgrounding; appended as
  JSONL to `Paths.document/metrics/taps.jsonl`. Flushing is never inline — the
  write is synchronous and would otherwise run with a finger on the glass. A failed
  flush returns samples to the buffer instead of dropping them: this dataset exists
  to characterise bad networks, so the sink must not censor the tail it measures.
  Setting `METRICS_ENDPOINT` in `metrics/sink.ts` sends the same batches over HTTP
  — that is all of step 13.

  Two columns beyond the original list, both earned by the data:
  **`idleMs`** because §6's radio-wake trap is a function of idle time, and
  **`sameAsPrevious`** because `cacheHit` alone cannot tell a retrigger from a
  switch between two equally-cached pads — they differ by 4×, which would have made
  warm p50 move with how someone taps rather than with the app. Records are
  **schema v2**.

  *Measures `onPressIn → source scheduled`, not "first audible sample".*
  react-native-audio-api exposes neither `outputLatency` nor `baseLatency`, so the
  output buffer (~10–40 ms on Oboe) is invisible from inside the app. Constant, so
  ladder comparisons hold — but it sits under any absolute p95 < 150 ms claim.
  **Calibrate it once** against an external recording (tap transient → audio onset).

  *Verified on the emulator 2026-08-22.* Every field populates; `connection.type`
  reads `wifi`, so NetInfo is genuinely linked rather than degrading to `unknown`.
  Both flush paths fire. **Three regimes, measured in one session:** first tap
  **53.7 ms** (constructs the AudioContext) · switch to a cached pad **14.2 ms** ·
  same-pad retrigger **3.3 ms**. §6 says "retrigger is free" and the 3.3 ms agrees;
  the 14 ms for a *cached* pad is the part nobody predicted.

  **These are not a baseline.** They predate step 6's manifest-backed clips, so
  they contain no useful network split. Treat every number above as a plumbing
  test. **Still unmet:** the real dataset needs a phone on cellular (step 1, R6).

  Pull a dataset with
  `adb exec-out run-as dev.sarunas.soundboard cat files/metrics/taps.jsonl > taps.jsonl`
  — the emulator's file mixes v1 and v2 records plus hand taps, so filter on `v`.

  *Rebuild note:* `@react-native-community/netinfo` is a native dependency; a JS
  bundle newer than the installed APK tags samples `unknown` rather than crashing.

**Exit:** a tap on a real phone on cellular plays the sound, and the timing is in a dataset.

## M1 — Service skeleton + pipeline end-to-end

*Skeletons only:* the worker already runs as a separate process at concurrency 1
(step 10's shape) and SQLite opens in WAL, but there is no jobs table, no
adapters and no ffmpeg render. `GET /health` exists; `/manifest` and `/metrics` do not.

- [ ] 9. SQLite (WAL) + migrations. Jobs table with all four semantics hand-written (#12): atomic claim via `UPDATE … RETURNING`, lease recovery, retry with backoff → dead-letter, idempotency via content addressing.
- [ ] 10. Worker as a **separate process**, concurrency 1.
- [ ] 11. `direct-file` adapter only — browser UA, `audio/*` content-type check. The unbreakable smoke test, so M2's failures are unambiguously yt-dlp's.
- [ ] 12. ffmpeg render: whole file → AAC-LC, mono, 44.1 kHz, 64 kbps, loudness-normalised (#14). Upload to R2; manifest version++.
- [ ] 13. `GET /manifest` behind the bearer token. Real `/metrics`; point M0's instrumentation at it.

**Exit:** paste a myinstants URL into `curl`, refresh the app, the pad is there.

## M2 — YouTube adapter

- [ ] 14. `ytdlp` adapter behind M1's interface. `bestaudio` only; **stream to disk, never `readFile` a master into a Buffer** (§7).
- [ ] 15. Reject sources > ~20 min. Dedup on `canonicalId` — same video twice ⇒ one `Source`.
- [ ] 16. Cookies file for the bot challenge from a DO IP. Collapse every failure into one message: *"that URL didn't work, try uploading the file."*

**Exit:** paste a YouTube URL, get the full-length audio as a pad.

## M3 — Editor *(same service, same origin)*

- [ ] 17. Worker adds probe + peaks JSON + low-bitrate preview. **Scrub against the preview, never the master.**
- [ ] 18. Editor UI at `/editor`: waveform from server peaks, draggable handles, live-looping selection, ±10/±100 ms nudge.
- [ ] 19. Dual render on commit (#13): `clips/<hash>.m4a` tight + `edits/<hash>.m4a` padded ±4 s, clamped to source bounds.
- [ ] 20. GC: temp deleted on commit, TTL sweep for abandoned sessions, orphan detection for bucket objects with no `Clip` row. This is the work decision #5 exists to force.
- [ ] 21. Nightly `sqlite3 .backup` to `db/` in the bucket — the only non-reconstructible state (R5).

**Exit:** YouTube URL → trim to a 2-second moment → tap it on the phone.

## M4 — Navigation

- [ ] 22. Local manifest mirror; background refresh on version change.
- [ ] 23. Home board: frozen `gridPos`, pinning, ⋯ → Edit → drag to reorder (a `Pad.gridPos` write — never touches an asset).
- [ ] 24. Search: substring + tag, **deterministic stable sort** on (match rank, id). Clearing returns home.
- [ ] 25. Prefetch the first row or two as results render — search is where the cold-tap problem concentrates (§9). Design for 6–8 visible pads under the keyboard.

**Exit:** 50+ clips, navigable at speed.

## M5 — Optimization

- [ ] 26. Climb DESIGN §6's ladder **one rung at a time** against measured p95, keeping the numbers at each step. Target **p95 < 150 ms**.
- [ ] 27. RN substitutions: rung 3 (`preconnect`) → warm-up HEAD request on launch; rung 7 (service worker) → `expo-file-system` cache with an explicit policy. **Do not add the file cache before rung 7** (R3) — arriving at the local cache is the lesson, skipping to it isn't.

---

## Two rules that outrank the checklist

1. **The droplet is never on the playback path** (DESIGN §2). Ingest may be down; the soundboard still plays.
2. **Latency numbers only count from a real device on cellular with the cache cleared** (R6). A laptop on wifi will tell you everything is fine.

## Shared Imli release packaging

- [x] **Step 1 — Versioned release packaging.** Implemented and locally
  verified on 2026-10-11 against a `publishable: false` image built from a dirty
  checkout. The packaging tests, gateway/supervisor tests, isolated fixture
  harness, and resource checks passed. This does not establish production
  readiness; a clean build from a reviewed commit remains pending. See
  [`deploy/shared-imli/release/README.md`](deploy/shared-imli/release/README.md)
  and the [verification record](deploy/shared-imli/release/VERIFICATION.md).
- [ ] **Step 2 — Deployment safeguards.** Add health checks, load validation,
  soak/load checks, rollback safeguards, and monitoring on the target host.
  The local preflight correctly rejected the dirty, non-publishable image;
  300-second fixture load and fault-injection checks passed on 2026-10-11.
  Production App Platform health settings, monitoring, and target-host checks
  remain pending. No push or deployment occurred. See
  [`deploy/shared-imli/ops/README.md`](deploy/shared-imli/ops/README.md) and
  [`deploy/shared-imli/ops/RUNBOOK.md`](deploy/shared-imli/ops/RUNBOOK.md), plus
  the [local verification record](deploy/shared-imli/ops/VERIFICATION.md).
- [ ] **Step 3 — Review and release.** Review the final artifact; commit, push,
  and deploy only with user approval. A clean release build remains pending.
- [ ] **Step 4 — Hosted APK.** Rebuild the standalone APK configured with the
  hosted HTTPS editor API URL and matching personal token. Pending.
- [ ] **Step 5 — Real-phone checks.** Complete the required phone verification.
  Pending.
