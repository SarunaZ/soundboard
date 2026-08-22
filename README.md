# Soundboard

A grid of pads on an Android phone that fire short meme sounds instantly, plus a
web editor for grabbing audio from a URL and trimming it to the moment worth
keeping.

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

Setup is done and M0 is in progress; see [STEPS.md](STEPS.md). The next blocking
step is the Cloudflare R2 bucket — the pads currently play bundled placeholder
tones rather than real clips.

## Licence and scope

Private, personal, non-commercial. Ripping YouTube audio breaches their terms of
service, so this can never become a public product with a signup page
(DESIGN §11).
