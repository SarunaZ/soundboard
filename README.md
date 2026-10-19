# Soundboard

A grid of pads on an Android phone that fire short meme sounds instantly. The
current YouTube authoring flow and device-file Editor flow let you trim a
moment and save it in the phone's private library for offline playback.
YouTube renders are `.m4a`; device-file editing renders a PCM16 WAV preview
on-device. The library and board support up to 1,000
soundbites. Five existing Worker/R2 sounds and 11 bundled sounds remain the
first 16 board defaults; local clips are never uploaded to R2. In the Library,
search by name or rename a clip. **Add to board** lets you append a new sound or
choose one of the original 16 pads to assign or replace. Removing an assignment
restores that pad's original remote or bundled sound; deleting a library clip
clears its board assignments. Renaming changes only clip metadata and refreshes any board
labels that use the clip.

Use **Edit board** to rearrange original and local sounds. Drag a pad's handle
to its new position, or select a pad and choose a destination. The order is
saved on-device and restored after reopening the app. The separate **×** button
removes a local assignment while keeping its library file. The app reserves
the phone's safe area so its footer stays above system navigation buttons or
the gesture bar.

Choose an MP3, M4A, WAV, or AAC file from the Editor's device picker (up to
5 minutes and 32 MiB) to trim before saving. The Editor decodes PCM on-device,
shows its waveform and range selection, and previews the rendered PCM16 WAV.
Name the result, save it to the private Library, then use **Add to board**. The
original file stays untouched; local editing does not call the YouTube service
or upload audio. The flow has been emulator-verified with MP3; M4A/WAV/AAC and
physical-phone checks remain pending. Search is case-insensitive and preserves
current sound order in both the Library and board.

The real objective is **learning asset management** — masters and derivatives,
content addressing, ingest job state, storage lifecycle, cache behaviour. Several
decisions are deliberately not the pragmatic choice; they are marked
**[learning choice]** in [DESIGN.md](DESIGN.md) with the cost stated.

- [DESIGN.md](DESIGN.md) — the *why*. Decisions, latency budget, constraints.
- [PLAN.md](PLAN.md) — the *order*, and the reasoning behind it.
- [STEPS.md](STEPS.md) — the flat checklist and current status.
- [Stimmyz design plan](docs/stimmyz-design-plan.md) — the 2026-10-17 design
  handoff audit, file-level redesign sequence, migration strategy and acceptance checks.

The Google Play app is being implemented separately in [app-play/](app-play/README.md),
reusing selected audio and editing code from this repository. `app-client/`
remains the Dev/personal app with its existing data, UI and YouTube workflow.
Play uses its own entrypoint, Android identity and private storage. Its first
slice includes named boards, themes, a private Library, and local audio import
or foreground microphone recording through Source → Trim → Details → Save.
Audio sources are limited to five minutes and 32 MiB, and trim selections to 60
seconds. Microphone permission is requested contextually in Play. Emulator checks
passed first-use permission, recording through save and relaunch, and foreground
interruption; the emulator has silent input by default, so physical microphone
quality remains unverified. Play now accepts MP4 and MOV containers with audio;
share import and interrupted-draft restoration remain pending. See the
[design plan](docs/stimmyz-design-plan.md) and
[recording emulator record](docs/play-recording-emulator-2026-10-18.md).

The current visual authority for Play is the
[Stimmyz Astra Clean Rebuild](docs/design/StimmyzApp_Astra_Clean_Rebuild_2026-10-18/DESIGN_SOURCE_OF_TRUTH.md),
with its [implementation guide](docs/design/StimmyzApp_Astra_Clean_Rebuild_2026-10-18/ASTRA_IMPLEMENTATION.md),
tokens and prototype. The earlier reviewed handoff and research audit remain
historical planning records and are superseded for current Play visual
decisions. Native clean-rebuild simulator verification is complete; see the
[QA record](docs/play-clean-rebuild-2026-10-18.md).

Build Play independently with `.\scripts\build-play-android.ps1` (or use
`-StageOnly` to verify the source boundary without Docker). The build creates
an unsigned testing APK and unsigned AAB under an isolated ignored `data/` stage;
it does not sign, install or publish them.
The latest Play test build is version 1.0.15/code 16 for ARM64 and x86_64.
Final native clean-rebuild and density checks passed; the signed testing APK is
in [data/play-clean-rebuild-final-20261019/artifacts/](data/play-clean-rebuild-final-20261019/artifacts/)
and has SHA-256 `b1367719f15861e5e8b4f5273e4969a0d272f1cdf5ca55cb715c9912ca0b7aed`.
See the [final QA record](docs/play-clean-rebuild-2026-10-18.md).
Quick add is a separate first tile in the scrolling board grid. It stays first
when sounds are added or reordered and remains available when all pads are full.
See the [fixed Quick add checks](docs/play-pinned-quick-add-2026-10-18.md).
Play uses the Dev source's turquoise S launcher icon, with separate Play-owned
copies of its standard, adaptive and monochrome assets.
See the [launcher-icon verification record](docs/play-launcher-icon-2026-10-18.md).
Choose file uses the Android document picker and preserves provider filenames;
native MP3 import, cancellation and invalid-file handling passed simulator checks.
See the [file-picker verification record](docs/play-file-picker-2026-10-18.md).
The Board wordmark uses the reviewed design's 32 sp size with a smaller sparkle;
normal and compact large-text simulator checks passed.
Customize's artwork buttons read **Choose image** and **Change image**.
Customize offers Imgflip's free popular-template picker with local name filtering
and optional artwork saved as a private thumbnail for offline use. The trim,
image-selection, save and offline-restart checks passed in the simulator; see
the [artwork verification record](docs/play-imgflip-artwork-2026-10-18.md).
Edit controls overlay the board without moving tiles or changing scroll position;
see the [native layout checks](docs/play-edit-geometry-2026-10-18.md).
In Play's Edit board mode, drag a grip or tap a pad then its destination to
rearrange it. Order is saved on drop; sounds, labels and colors move together.
See the [pad-reorder verification record](docs/play-pad-reorder-2026-10-18.md).
The six Play palettes are Peach, Mint, Snow, Ice, Vanilla and Coffee; Appearance
is reachable from the Board header options. Board and waveform Quick add can
start Record, Choose file or Library. Quick add actions and pad overflow menus
are anchored to their controls and remain available in the modes defined by the
design. The Editor opens directly to its dashed file-source card and recording
action, then uses Source → Trim → Details. Library artwork can be selected from
the device gallery or Imgflip and changed on saved clips. The simulator checks
also covered offline relaunch, direct Quick file/record actions, large-text
reflow, and retention of existing clips and assignments. See the complete
[clean-rebuild QA record](docs/play-clean-rebuild-2026-10-18.md) and [STEPS.md](STEPS.md)
for remaining work.
The emulator recording checks are recorded in
[the recording verification record](docs/play-recording-emulator-2026-10-18.md);
physical microphone behavior remains unverified. The earlier first-slice
packaging checks are in the [verification record](docs/play-verification-2026-10-17.md).

## Clone

```bash
git clone https://github.com/SarunaZ/soundboard.git
```

`app-client/` is a plain directory in this repo and a Yarn workspace member, so
it clones with everything else. It imports `@soundboard/shared`, and a change
spanning the two is a single commit.

## Build

**Docker is the only prerequisite.** No Node, Yarn, corepack, JDK or Android SDK
on the host.

```bash
./sb.sh build
```

On Windows use `.\sb.ps1 build`. It runs three stages: dependencies (installed
inside Linux), the service image, and the Android APK. From a bare checkout it
takes roughly 6 minutes; later APK builds are about a minute because Gradle's
cache lives in a named volume.

| Command | What it does |
|---|---|
| `sb build` | Everything: dependencies, service image, APK |
| `sb apk` | Debug APK only (`--all-abis` for an x86_64 emulator, `--clean` to wipe first) |
| `sb metro` | Metro dev server (needs `LAN_IP` in `.env`) |
| `sb service:up` / `:down` / `:logs` / `:health` | The api + worker containers |
| `sb shell` | Bash inside the Android toolchain container |
| `sb doctor` | Check Docker and the images |

Copy `.env.example` to `.env` before running Metro or the service.

## Local editor on Android (USB development)

The temporary editor API listens on host loopback port 8080. Put a personal
`EDITOR_TOKEN=<same-secret>` in the ignored root `.env`. In the ignored
`app-client/.env.local`, set the matching token and local URL:

```dotenv
EXPO_PUBLIC_EDITOR_API_URL=http://127.0.0.1:8080
EXPO_PUBLIC_EDITOR_TOKEN=<same-secret>
```

Build the service image and APK with `.\sb.ps1 build`, then run
`.\sb.ps1 service:up` and `.\sb.ps1 metro`. Refresh the native APK with
`.\sb.ps1 apk` after native dependency changes. With the Android phone
connected over USB, forward both ports:

```powershell
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8081 tcp:8081
```

The 8080 HTTP URL and loopback binding are for USB development only. Do not
publish the loopback service binding; use HTTPS for a remote private endpoint.
Rendered clips stay in the app-private local library, support offline playback,
and are removed when the app is uninstalled. They are not uploaded to Cloudflare
R2.

The YouTube editor accepts standard watch links, Shorts links, and `youtu.be`
share links over HTTP or HTTPS. It uses only the selected video: playlist and
tracking parameters are discarded, and a playlist link without a video ID is
rejected. Device-file editing uses the separate on-device path described above.

The opt-in native YouTube extraction prototype has a separate package ID and
staged APK workflow. See [docs/android-youtube-prototype.md](docs/android-youtube-prototype.md)
and `scripts/build-youtube-prototype.ps1`; the ordinary build keeps the
downloader dependencies disabled.

The private YouTube sideload release uses package ID
`dev.sarunas.soundboard.sideload` and starts with an empty local Library. Its
release and playback progress changes pass the combined release-profile suite
(101/101 app tests) and the TypeScript check. The signed 1.0.1 update was
verified and installed on a Samsung phone on 2026-10-15. Audio and interaction
acceptance and the dependency/notice inventory remain pending, so L16 stays
open. See
[docs/private-android-release.md](docs/private-android-release.md).

The keyboard visibility fix covers both the Editor's clip-name field and the
Library's rename field. The combined app suite passes 112/112 tests and
TypeScript passes. The replacement private APK is signed as version 1.0.1
(code 2) with the same application ID and signing identity, then installed as
an update on 2026-10-15. Physical-device checks of both inputs and confirmation
that saved clips remain usable are pending. See [STEPS.md](STEPS.md) for L17.

## Layout

```
shared/       Clip, Pad, Source and manifest types (DESIGN §4)
service/      Express API + a separate worker process; SQLite is both
              metadata store and job queue (DESIGN #12)
app-client/   Expo React Native soundboard
app-play/     Separate Play app; shared audio core, independent UI/data/build
sb.ps1 sb.sh  Docker-only task runner
```

## Known rough edges

- **Metro file watching does not work over a Windows bind mount.** inotify events
  do not cross it, so Metro serves a stale graph and reports errors about code
  you already changed. Restart the metro container after editing JS until this is
  fixed (polling in `metro.config.js`, or move the repo into WSL2).
- **Delete `node_modules` from a container**, not from Explorer or PowerShell —
  Windows file locking and the 260-character path limit leave it half-removed:
  `docker run --rm -v "$PWD:/w" node:24-bookworm-slim rm -rf /w/node_modules`
- The emulator cannot tell you anything about the latency this project exists to
  study. Numbers only count from a real device on cellular with the cache cleared
  (DESIGN §6).

## Status

M0's remote feature path is complete; its real-phone/cellular measurement is
still pending. Five clips are served from private R2 through the public
Cloudflare Worker, and the app loads, validates, resolves, and preloads them
from the immutable v1 manifest. The other 11 pads remain bundled placeholders
for comparison. The local-authoring pivot was approved on 2026-10-10. App and
service type checks/builds, all 69 tests (59 app, 4 Worker, 6 service), and an
all-ABI debug APK installed on
the Android 36 emulator have passed. The fixture-based in-app trim/render/save
flow and saved-file offline playback are verified on the Android 36 emulator
after app restart with the API/worker stopped and Wi-Fi/mobile data off
(MediaSession/AudioFlinger confirmed playback of the saved 1.478 s AAC file).
The debug JS bundle still came over USB Metro, so this is not a standalone
offline-launch or audible-listening claim. The backend live-source smoke also
passed for watch-plus-playlist video `OjNpRbNdR7E` and Shorts video
`jlPQtJXy9t8`: both imported, returned ranged previews, and rendered a 2-second
clip without bypassing YouTube access restrictions. The local board lifecycle
was verified: replacement, removal to the default, re-add, and assignment
restoration after an online force-stop/restart via USB Metro. After the JS app
loaded, a local clip also played with the API/worker stopped and airplane mode
on with Wi-Fi off; an active AudioFlinger track matched the app PID. The clip's
SHA-256 was unchanged. A cold offline start failed because the development
client could not load its JS bundle, so standalone offline launch is not
verified. Physical-phone interaction and the live-source in-app save flow
remain pending. Device import passed emulator checks with an MP3 selected from
Android Downloads: it retained identical source bytes, survived an online
force-stop/relaunch, and played from pad 14. Deleting only the synthetic Library
copy removed that private file and restored pad 14's default; the Downloads
source and existing user clip/pad 16 assignment stayed unchanged. Those checks
record the superseded whole-file import flow (L12), not the current Editor
workflow. L14's device-file Editor flow is implemented and emulator-verified
with MP3; M4A/WAV/AAC and physical-phone checks remain pending. On 2026-10-12,
the user reported that the native YouTube prototype works; extraction was not
independently confirmed in this task, and L15's remaining checks stay open. The
private sideload release and playback progress work is tracked as L16 in
[STEPS.md](STEPS.md) and [docs/private-android-release.md](docs/private-android-release.md).
[STEPS.md](STEPS.md) is authoritative for the L-series local workflow and
historical 1–27 roadmap.

Shared Imli release packaging step 1 is implemented and locally verified, with
a dirty, non-publishable image. It is not a production-readiness claim; step 2's
production checks and steps 3–5 remain pending. See the
[packaging workflow](deploy/shared-imli/release/README.md), [verification
record](deploy/shared-imli/release/VERIFICATION.md), and [STEPS.md](STEPS.md)
for details.

Shared Imli step 2's local preflight correctly rejected the dirty,
non-publishable image, and the fixture load and fault-injection checks passed on
the final combined image. Production monitoring, App Platform health settings,
and target-host verification remain pending; no push or deployment occurred.
See the [operations notes](deploy/shared-imli/ops/README.md),
[runbook](deploy/shared-imli/ops/RUNBOOK.md), and
[verification record](deploy/shared-imli/ops/VERIFICATION.md).

## Licence and scope

Private, personal, non-commercial. Use YouTube sources only when you own them or
are allowed to use them. The local editor does not bypass YouTube login, bot, or
access restrictions; see the current-direction section in [DESIGN.md](DESIGN.md).
