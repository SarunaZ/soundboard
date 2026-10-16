# Soundboard — Plan of Action

**Status:** M0's remote feature path is complete; its real-phone/cellular
measurement remains pending. The 2026-10-10 local-authoring pivot is implemented
and fixture-verified through render and local save. The backend live-source
smoke also passed for a watch-plus-playlist URL and a Shorts URL, including
ranged previews and 2-second renders without access bypass. App strict TypeScript,
the shared/service TypeScript build, all 69 tests (59 app, 4 Worker, 6 service),
and the all-ABI debug APK on the Android 36 emulator pass. Saved-file playback after app restart was verified
on the Android 36 emulator with the API/worker stopped and Wi-Fi/mobile data off;
the debug JS bundle still came over USB Metro. The local board lifecycle passed:
replacement at pad 16 persisted to `board.json`, removal restored the
default and cleared the mapping, re-add wrote the assignment again, and an online
force-stop/restart via USB Metro restored it. After JS loaded, a local user clip
played with API/worker stopped and airplane mode on with Wi-Fi off; AudioFlinger
showed an active track for the app PID. Its SHA-256 stayed unchanged. A cold
offline start failed because the development client could not load its JS bundle;
standalone offline launch is not verified. Device import passed emulator checks:
a Downloads MP3 kept identical source bytes, survived an online force-stop/relaunch,
and played from pad 14. Deleting only the synthetic Library copy removed that
private file and restored pad 14's default; the original Downloads source and
existing user clip/pad 16 assignment stayed unchanged. Picker cancellation and
invalid/overlong input left the catalog unchanged; native checks described the
superseded whole-file import path with MP3 only. L14's replacement local-file
Editor is implemented and emulator-verified with MP3; M4A/WAV/AAC and
physical-phone checks remain pending. See
[STEPS.md](STEPS.md) for the authoritative
L-series sequence and historical implementation status.
**Date:** 2026-08-15, revised 2026-10-10
**Reads with:** [DESIGN.md](DESIGN.md) — that doc holds the *why*; this one holds the *order*.

---

## Current direction — approved pivot (2026-10-10)

This section takes precedence over the historical editor-first and online-first
plans below, only for newly authored local clips. The existing remote manifest
and source assets are unchanged: five R2-backed clips and 11 bundled comparison
pads remain the first 16 defaults. A persistent local clip-ID-to-slot overlay
can append a local clip as a new board sound or assign it to one of those
original pads; removing an assignment restores that pad's original remote or
bundled sound. Replacing an assignment selects another local clip. The library
and board support up to 1,000 soundbites, with case-insensitive name search
that preserves current order. Local assignments play offline independently of
the remote API. The remote cache ladder has not been completed by this pivot.

The user pastes a YouTube URL into the Android app. The app displays an in-app
waveform with two range handles, previews the selected range, asks the existing
temporary service to render the selected audio as an actual `.m4a`, and saves
that file plus a local catalog entry under `Paths.document/local-clips`. This
private app library persists across app restarts and supports offline local
playback. Android uninstall removes it; this is not the Downloads folder or a
cloud backup. The server has no persistent output library and performs no R2
writes for this flow.

The device-file workflow opens in the Editor, not as a whole-file Library copy.
The Editor accepts MP3, M4A, WAV, or AAC sources up to 5 minutes and 32 MiB,
decode PCM fully on-device, display a waveform and range handles, and render a
PCM16 WAV preview for the selected range (maximum 60 seconds). The user names
the result and saves it to the app-private Library, then can use **Add to board**.
The original source remains untouched. Local-file editing uses no YouTube API or
temporary service, creates no upload, and uses an owned temporary cache whose
files are cleaned up. L14 is implemented and emulator-verified with MP3. Native
verification for M4A/WAV/AAC and physical-phone checks remain pending.

A soundbite can be renamed from the Library; this updates only catalog metadata,
so assigned board labels use the new name. The YouTube Editor still requires a
nonblank name before saving a rendered clip.

The service is a temporary source/preview/render boundary. It rejects sources
over 20 minutes, limits a selection to 60 seconds, and expires temporary files
through TTL cleanup. `/health` is independent and unauthenticated; all `/editor`
endpoints require the `EDITOR_TOKEN` bearer token. In the ignored
`app-client/.env.local`, set `EXPO_PUBLIC_EDITOR_API_URL` and
`EXPO_PUBLIC_EDITOR_TOKEN`; the token value must match the service's
`EDITOR_TOKEN`. It is a personal token baked into this app build, not production
authentication.

For USB development, bind the Docker API on host loopback port 8080, run
`adb reverse tcp:8080 tcp:8080`, and set the app URL to
`http://127.0.0.1:8080`. Keep Metro's existing `adb reverse tcp:8081 tcp:8081`
too. This loopback HTTP setup is for local USB development only; a remote private
endpoint must use HTTPS. Never publish the loopback Docker service binding.
Adding `expo-audio` requires a rebuilt APK; if the ignored `app-client/android`
directory needs regeneration, use the normal Expo prebuild without a clean
wipe.

Cloudflare uploads may be considered later as a separate feature. For the
current local flow, the selection is not uploaded to R2 and must remain playable
after restart and with the service unavailable.

From the Library, **Add to board** can append a sound as the next board slot or
open a numbered picker for the original 16 pads. It prompts before replacing an
occupied assignment. Removing an assignment restores its default sound;
deleting its library clip clears its assignments. Missing local clips fall
back to their pad defaults, and the local audio files remain private on the
device.

### Board ordering — user-approved amendment (2026-10-16)

Stable slot indexes continue to identify assignments, while a separate
persisted visual order controls where pads appear. In Edit mode, users can move
any original or appended local pad. Legacy snapshots without an explicit order
keep their existing ascending slot order until the user changes it. This
requirement supersedes the historical fixed or familiar-position assumption
wherever it differs; moving a pad does not change its assignment.

## Historical amendments to DESIGN.md

The following table records the earlier roadmap and is not the current local
clip sequence. A1's Android client choice remains; A2's YouTube adapter and A3's
separate web editor are superseded for local authoring by the pivot above. Their
unfinished remote ingest/editor work remains deferred, not complete.

These three amendments describe the historical architecture decisions. The
local-authoring pivot above supersedes their editor-first scope; the existing
remote playback board still keeps the droplet off its playback path.

| # | Amendment | Supersedes | Cost accepted |
|---|---|---|---|
| **A1** | **Soundboard is React Native, not a PWA.** | Decision #1, §12 | Native build toolchain on day one (Expo Go can't load the audio module). Kills §6 rung 7 as written — service worker becomes an on-device file cache, which is *easier*, so the local-cache endgame arrives sooner and with less measurement pressure. See §5 risk R3. |
| **A2** | **YouTube moves from last to second.** | M4 → M2 | The fragile path becomes load-bearing much earlier. Mitigated by keeping the direct-file adapter as M1's smoke test (§3, M1) so the pipeline is proven against a source that cannot break before yt-dlp is introduced. |
| **A3** | **Editor ships inside the ingest service** — one repo, one deploy, one origin. | — | None structurally; this is what DESIGN §5 already implies. Note it means *one service*, not *one process*: §7 still requires the worker be a separate process. |

**Historical remote-plan note:** for that R2 pipeline, masters are discarded
after render (#5), and the service shares the $5 droplet with imli-system under
a hard memory cap (#3, §7). This does not describe the local clip library.

Sections 1–6 below retain the prior remote-ingest plan as context. That work is
deferred; the current local-authoring sequence is the L-series in [STEPS.md](STEPS.md).

---

## 1. Topology

```
soundboard/
├── DESIGN.md
├── PLAN.md
├── shared/                  Clip/Pad/manifest types — imported by service + app
├── service/                 ← "the same service" (A3)
│   ├── src/api/             Express: /ingest /sessions /manifest /metrics
│   ├── src/worker/          separate process: claims jobs, runs yt-dlp + ffmpeg
│   ├── src/adapters/        direct.ts · scrape.ts · upload.ts · ytdlp.ts
│   ├── src/render/          ffmpeg invocations, peaks, loudnorm
│   ├── src/storage/         R2 client, content-addressed put
│   ├── src/db/              better-sqlite3, migrations, jobs queue
│   ├── editor/              Vite + React waveform editor
│   └── public/              ← editor build output, served by src/api
└── app/                     Expo React Native soundboard
```

One origin for the editor and the API means no CORS and no second deploy target.
The RN app talks to the same API for the canonical manifest only — and to the
public `soundboard-media` Worker for every byte of audio. The Worker reads from
private R2; the droplet is never on the playback path.

### Stack

| Layer | Choice | Why |
|---|---|---|
| Service | Node 24 + TypeScript + Express | Matches imli-system, so no new runtime on the droplet. REST, not GraphQL — this is four endpoints and a file upload. |
| DB + queue | `better-sqlite3`, WAL | Decision #12. Native module: needs build-essential/python3 on the droplet. Synchronous ⇒ **worker must be a separate process** (§7). |
| Media | `yt-dlp` + `ffmpeg` as binaries | Pinned versions, invoked with `spawn`, streamed. yt-dlp needs ffmpeg on PATH for extraction. |
| Bucket | Cloudflare R2 via `@aws-sdk/client-s3` | S3-compatible, zero egress (#6). |
| Editor | Vite + React + `wavesurfer.js` v7 (regions plugin) | Accepts a **pre-computed peaks array**, so the browser never decodes the master — which matters because the master is on the droplet, not in the bucket. |
| App | Expo (prebuild + dev client) + `react-native-audio-api` | That library mirrors Web Audio, so §8's engine — decoded buffer, fresh source node per trigger, per-voice gain — ports as written. Needs a custom dev build; **Expo Go will not work.** |
| App cache | `expo-file-system` | Rung 7 of §6, in native form. |

---

## 2. Bucket layout

One private R2 bucket with content-addressed keys. The read-only
`soundboard-media` Worker exposes clip objects with `Cache-Control: public,
max-age=31536000, immutable`; neither the bucket endpoint nor credentials reach
the client.

```
clips/<sha256>.m4a     tight clip      ~24 KB   ← the phone fetches only these
edits/<sha256>.m4a     ±4 s padded     ~88 KB   ← only the editor fetches these
manifest/v<n>.json                     ~40 KB   ← optional; see below
```

No `sources/` prefix — masters are discarded (#5, confirmed).

**The edit is saved in two places, and both matter.** The bytes go to `edits/`;
the *recipe* (`trimStartMs`, `trimEndMs`, `gainDb`, fades, pad amounts) stays in
SQLite on the `Clip` row. Re-editing a clip loads `edits/<hash>.m4a` and replays
the recipe against it. Losing SQLite would leave orphaned audio with no
provenance, so: **nightly `sqlite3 .backup` to the bucket under `db/`.** That's
the one piece of state that isn't reconstructible, and it's ~1 MB.

Manifest is served by the API (bearer token, §12) rather than from the Worker
once M1 exists, because it's the one thing that legitimately needs auth. M0 uses
a hand-written, versioned bootstrap manifest through the Worker to prove the hot
path without droplet code. It is small enough (~40 KB at 200 clips) that the
eventual authenticated fetch never touches the playback path — the app mirrors
it locally and refreshes in the background.

---

## 3. Milestones

Ordering rule from DESIGN §10 is preserved: **nothing gets built before something
can play its output.**

### M0 — Bucket + RN playback shell *(no droplet work at all)*
- Create the private R2 bucket and read-only Worker route; set the immutable
  cache header on public clip responses.
- Hand-upload ~5 clips from myinstants; hand-write `manifest/v1.json` next to them.
- Expo prebuild + dev client + `react-native-audio-api`; 4×4 grid of pads.
- Playback engine per §8: trigger on **`onPressIn`** (the RN equivalent of
  `pointerdown` — `onPress` fires on release and is the sluggishness bug),
  monophonic with a ~8 ms fade on the outgoing voice, **gain node per voice**,
  LRU of ~30 decoded buffers.
- **Instrumentation, day one:** record `onPressIn → first audible sample`, tagged
  with cache hit/miss and connection type. Buffer on device, POST in batches to a
  stub endpoint (a file on disk is fine until M1).

**Exit:** tapping a pad on a real Android phone, on cellular, plays the sound —
and the timing is in a dataset. The manifest is a hand-written file, so this
milestone proves the *entire hot path* without a line of server code.

### M1 — Service skeleton + pipeline end-to-end
- **Droplet prep first, before the first ffmpeg run:** 2 GB swap, `systemd
  MemoryMax=` on both units. This is the single most important line in §7 —
  without it the OOM killer may pick imli's Mongo.
- SQLite + migrations. Jobs table with all four semantics hand-written (#12):
  atomic claim via `UPDATE … RETURNING`, lease recovery, retry with backoff →
  dead-letter, idempotency via content addressing.
- Worker as a **separate process**, concurrency 1.
- `direct-file` adapter only — browser UA, `audio/*` content-type check. **This
  is the smoke test for A2:** an unbreakable source proving fetch → render →
  upload → manifest bump, so that when yt-dlp fails in M2 the failure is
  unambiguously yt-dlp's.
- ffmpeg render: whole file → AAC-LC, mono, 44.1 kHz, 64 kbps, loudness-normalised (#14).
- R2 upload; manifest version++; `GET /manifest` behind the bearer token.
- Real `/metrics` endpoint; point M0's instrumentation at it.

**Exit:** paste a myinstants URL into `curl`, refresh the app, the pad is there.

### M2 — YouTube adapter *(ask #1, part one)*
- `ytdlp` adapter behind the M1 interface. `bestaudio` only (~1 MB/min, not ~50).
  Stream to disk — **never `readFile` a master into a Buffer** (§7).
- Reject sources > ~20 min. Dedup on `canonicalId` (the video ID): ingesting the
  same video twice yields one `Source`.
- Failure taxonomy → one user-facing message: *"that URL didn't work, try
  uploading the file."* A yt-dlp break must never look like a broken app.
- Cookies file for the bot challenge from a DO IP. Residential proxy only if it
  becomes genuinely annoying.

**Exit:** paste a YouTube URL, get the full-length audio as a pad.

### M3 — Editor, in the same service *(ask #1, part two + ask #2)*
- Worker adds: probe, peaks JSON, low-bitrate preview rendition. **Scrub against
  the preview, never the master.**
- Editor UI at `/editor` off the same origin: waveform from server peaks,
  draggable handles, live-looping selection, ±10/±100 ms nudge buttons.
- **Dual render on commit** (#13): `clips/<hash>.m4a` tight and
  `edits/<hash>.m4a` padded ±4 s, clamped to source bounds. Both to the bucket.
- GC: temp deleted on commit; TTL sweep for abandoned sessions; orphan detection
  for bucket objects with no `Clip` row. This is the work #5 exists to force.
- Nightly SQLite backup to `db/` in the bucket.

**Exit:** YouTube URL → trim to a 2-second moment → tap it on the phone. Asks #1
and #2 are complete here.

### M4 — RN navigation *(ask #3, full)*
- Local manifest mirror; background refresh on version change.
- Home board with frozen `gridPos`, pinning, ⋯ → Edit → drag to reorder (a
  `Pad.gridPos` write; never touches an asset).
- Search: substring + tag, **deterministic stable sort** on (match rank, id), so
  the same query always yields the same arrangement. Clearing returns home.
- Prefetch the first row or two as results render — search is exactly where the
  cold-tap problem concentrates (§9).
- Keyboard eats half the screen: design for 6–8 visible pads or dismiss on render.

**Exit:** 50+ clips, navigable at speed.

### M5 — Optimization
Climb §6's ladder one rung at a time against the measured p95, keeping the
numbers at each step. Target **p95 < 150 ms**. RN substitutions: rung 3
(`preconnect`) becomes a warm-up HEAD request on launch; rung 7 (service worker)
becomes an `expo-file-system` cache with an explicit policy.

---

## 4. Day-one checklist

Ordered so nothing blocks on a thing that takes a day to install.

1. Android Studio + JDK; `npx create-expo-app`, `expo prebuild`, dev client on a
   real device over USB. **Do this first** — it's the longest-poled setup item
   and A1 is worthless if the toolchain fights.
2. Private R2 bucket + API token + public read-only Worker route; upload one
   file; fetch the Worker URL from the phone's browser without exposing an R2
   endpoint or credentials.
3. `react-native-audio-api` playing one hard-coded URL. If this doesn't work,
   the whole of A1 needs revisiting before anything else is built.
4. Only then: droplet swap + `MemoryMax`, and the repo skeleton in §1.

---

## 5. Risks

| | Risk | Mitigation |
|---|---|---|
| **R1** | **1 GB shared with imli's Docker stack** (Mongo + API + client). Mongo alone can hold 200–400 MB. Adding ffmpeg is genuinely tight, and the OOM killer chooses its own victim. | `MemoryMax` on the soundboard units *before* the first render (M1, step 1). Swap. Concurrency 1. If ffmpeg still can't fit, the fallback is a separate box — not raising the cap. |
| **R2** | **yt-dlp is now load-bearing (A2)** and will be fought from a datacenter IP, increasingly over time. | The direct-file adapter stays first-class, upload is always available, and the failure message routes users to it. The app never depends on ingest working. |
| **R3** | **RN makes local caching easy**, which quietly undercuts decision #8 — the online-first constraint that the §6 exercise depends on. | Do not add the file cache until rung 7, and only against a measured p95. Arriving at the local cache is the lesson; skipping to it is not. |
| **R4** | `better-sqlite3` is a native module and `react-native-audio-api` needs a custom dev build. Two native toolchains, two classes of build failure. | Both are exercised on day one (§4), before any product code depends on them. |
| **R5** | SQLite is the only non-reconstructible state; the bucket is content-addressed and disposable, but a lost DB orphans everything in it. | Nightly `.backup` to `db/` in the bucket, from M3. |
| **R6** | Instrumentation is invisible on wifi at a desk — the sleeping-radio trap (§6). | Every latency claim must come from a real device on cellular with the cache cleared. Numbers from a laptop don't count. |

---

## 6. Open

- Distribution: sideloaded APK (Android ⇒ no $99/yr, and no Play listing needed).
  A Play internal-track upload is $25 one-time if sideloading gets tedious.
- Manifest auth stays a static bearer token in the app (§12).
- Whether the editor needs any auth at all beyond not being linked from anywhere.
  It can trigger yt-dlp, so it is not harmless — revisit at M3.
