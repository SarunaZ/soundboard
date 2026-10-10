# Soundboard

A grid of pads on an Android phone that fire short meme sounds instantly. The
approved local-authoring flow lets you paste a permitted YouTube URL in the
Android app, trim a moment, render an `.m4a`, and keep it in the phone's private
library for offline playback. The existing Cloudflare Worker/R2 board remains
the remote playback comparison path; local clips are not uploaded to it.

The real objective is **learning asset management** — masters and derivatives,
content addressing, ingest job state, storage lifecycle, cache behaviour. Several
decisions are deliberately not the pragmatic choice; they are marked
**[learning choice]** in [DESIGN.md](DESIGN.md) with the cost stated.

- [DESIGN.md](DESIGN.md) — the *why*. Decisions, latency budget, constraints.
- [PLAN.md](PLAN.md) — the *order*, and the reasoning behind it.
- [STEPS.md](STEPS.md) — the flat checklist and current status.

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

The editor accepts standard YouTube watch links, Shorts links, and `youtu.be`
share links over HTTP or HTTPS. It imports only the selected video: playlist
and tracking parameters are discarded, and a playlist link without a video ID
is rejected.

## Layout

```
shared/       Clip, Pad, Source and manifest types (DESIGN §4)
service/      Express API + a separate worker process; SQLite is both
              metadata store and job queue (DESIGN #12)
app-client/   Expo React Native soundboard
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
service type checks/builds, all 19 tests, and an all-ABI debug APK installed on
the Android 36 emulator have passed. The fixture-based in-app trim/render/save
flow and saved-file offline playback are verified on the Android 36 emulator
after app restart with the API/worker stopped and Wi-Fi/mobile data off
(MediaSession/AudioFlinger confirmed playback of the saved 1.478 s AAC file).
The debug JS bundle still came over USB Metro, so this is not a standalone
offline-launch or audible-listening claim. The backend live-source smoke also
passed for watch-plus-playlist video `OjNpRbNdR7E` and Shorts video
`jlPQtJXy9t8`: both imported, returned ranged previews, and rendered a 2-second
clip without bypassing YouTube access restrictions. Physical-phone interaction
and the live-source in-app save flow remain pending. [STEPS.md](STEPS.md) is
authoritative for the L-series local workflow and historical 1–27 roadmap.

## Licence and scope

Private, personal, non-commercial. Use YouTube sources only when you own them or
are allowed to use them. The local editor does not bypass YouTube login, bot, or
access restrictions; see the current-direction section in [DESIGN.md](DESIGN.md).
