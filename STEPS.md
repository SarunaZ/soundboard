# Soundboard — Steps

**Status:** setup done; steps 7 and 8 done. Blocked on the R2 bucket (step 2).
**Date:** 2026-08-15, revised 2026-08-22
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
- [ ] 2. R2 bucket: public dev domain, `Cache-Control: public, max-age=31536000, immutable`. Upload one file, fetch it from the phone's browser. **← THE BLOCKER: needs a Cloudflare login. Steps 3 and 6 sit behind it.**
- [ ] 3. `react-native-audio-api` playing one hard-coded R2 URL. If this fights, revisit amendment A1 before building anything else. *The toolchain compiles the library; nothing has yet made a sound.*
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

- [ ] 6. Hand-upload ~5 myinstants clips; hand-write `manifest/v1.json` beside them.
- [x] 7. **4×4 pad grid + engine — done.** `app-client/src/audio/engine.ts` implements
  §8 as written: `onPressIn`, monophonic with an 8 ms fade on the outgoing voice,
  a gain node per voice, a fresh `AudioBufferSourceNode` per retrigger, LRU of 30
  buffers, no debouncing, plus concurrent-decode dedup so spamming a cold pad
  cannot start N decodes.
  *Measured on the emulator:* **246 ms cold, 11 ms warm** — read at the time as
  §6's bimodal split. **It is not** (step 8 reconciles it): with bundled tones
  there is no network in the path, so no cold/warm network split can exist yet.
  246 ms was a first-tap-of-session, which constructs the AudioContext.
  *Placeholder audio:* 16 bundled AAC tones (mono/44.1k/64k per #14). Step 6
  swaps in R2 URLs and only `pads.ts` changes — the engine takes a URI either way.
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

  **These are not a baseline.** Bundled tones put no network in the path, so §6's
  bimodal split cannot appear until step 6. Treat every number above as a plumbing
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
