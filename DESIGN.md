# Soundboard — Design

**Status:** M0's remote feature path is complete; the real-phone/cellular
measurement remains pending. The 2026-10-10 local-authoring pivot is the current
direction and is fixture-verified through render and local save. App strict
TypeScript, the shared/service TypeScript build, all 69 tests (59 app, 4 Worker,
6 service), and the all-ABI
debug APK on the Android 36 emulator pass. Saved-file playback after app restart
was verified on that emulator with the API/worker stopped and Wi-Fi/mobile data
off; the debug JS bundle still came over USB Metro. The local board lifecycle
passed replacement, removal to the default, re-add, and assignment restoration
after an online force-stop/restart via USB Metro. After JS loaded, a local user
clip produced an active AudioFlinger track matching the app PID with API/worker
stopped and airplane mode on with Wi-Fi off; its SHA-256 stayed unchanged. A
cold offline start failed because the development client could not load its JS
bundle, so standalone offline launch is not verified. The backend live-source
smoke passed for watch-plus-playlist video `OjNpRbNdR7E` and Shorts video
`jlPQtJXy9t8`, including ranged previews and 2-second renders without bypassing
access restrictions. Device import passed emulator checks with an MP3: it
retained identical source bytes, survived an online force-stop/relaunch, and
played from pad 14. Deleting only the synthetic Library copy removed that
private file and restored pad 14's default; the original Downloads source and
existing user clip/pad 16 assignment stayed unchanged. Picker cancellation and
invalid/overlong files left the catalog unchanged. Native import was verified
with MP3 only. Physical-phone interaction and live-source in-app save checks remain pending.
See [STEPS.md](STEPS.md) for the authoritative L-series
sequence and historical roadmap status.
**Date:** 2026-08-15, revised 2026-10-10

---

## Current direction — local authoring pivot (2026-10-10)

This dated amendment takes precedence over the older web-editor-first and
online-first decisions only for newly authored local clips. The existing
Cloudflare Worker/R2 manifest and source assets remain unchanged: five
R2-backed clips and 11 bundled comparison sounds are the first 16 board
defaults. A persistent local clip-ID-to-slot overlay can append a local clip as
a new board sound or assign one to an original pad; removing an assignment
restores that pad's original remote or bundled sound, while replacing it selects
another local clip. The library and board support up to 1,000 soundbites.
Case-insensitive name search preserves current order in both views. Local
assignments play offline independently of the remote API. This pivot does not
claim the remote cache ladder is complete.

The Android app accepts a permitted YouTube URL, shows an in-app waveform with
two range handles, previews the selected range, and requests a rendered `.m4a`
for that actual range. The resulting file and a local catalog entry live under
`Paths.document/local-clips` in the app-private library. They survive app
restarts and play offline without the service. Android uninstall removes them;
they are not Downloads and are not automatically cloud-backed-up.

Device audio is opened from the Editor's picker, rather than copied whole into
the Library. The local-file Editor accepts MP3, M4A, WAV, or AAC sources
up to 5 minutes and 32 MiB. Native on-device PCM decoding feeds a waveform and
two range handles; selection is capped at 60 seconds. The Editor renders a
PCM16 WAV preview, then saves the named selection to the app-private Library
for later **Add to board** assignment. Keep the original source untouched and
clean up only app-owned temporary cache files. This local-file path uses no
YouTube API or temporary service, sends no upload, and writes nothing to R2.
L14 is implemented and emulator-verified with MP3: a 61.07-second source opened
under the new 5-minute limit, exceeding L12's former 60-second cap. A named
4-second PCM16 WAV was rendered and saved, and its preview played. The new clip appended to pad
17 and remained assigned and playable after online force-stop/relaunch. Cache
cleanup on picker unmount left the original source hash and existing user clip
and pad 16 unchanged; deleting only the synthetic WAV restored the prior
catalog and cleared pad 17. M4A/WAV/AAC native checks and physical-phone checks
remain pending. No service-stopped or offline verification is claimed for this
new flow. The earlier whole-file Library import behavior and its MP3 checks are
retained as superseded L12 history in [STEPS.md](STEPS.md).

Library rename updates catalog metadata only; assigned board labels use the
new name. The YouTube Editor requires a nonblank soundbite name before saving
a rendered clip.

The existing temporary service is used only to fetch the source, provide
preview audio, and render the selected range. Source duration is capped at 20
minutes; selected ranges are capped at 60 seconds. Temporary server files expire
through TTL cleanup. There is no persistent server output library and no R2
write in this flow. `/health` is unauthenticated and independent; every `/editor`
endpoint requires an `EDITOR_TOKEN` bearer token. The app's ignored
`app-client/.env.local` uses `EXPO_PUBLIC_EDITOR_API_URL` and
`EXPO_PUBLIC_EDITOR_TOKEN`, with the latter equal to the service token. This is
a personal token embedded in the app build, not production authentication.

For local USB development only, bind the Docker API to host loopback port 8080,
run `adb reverse tcp:8080 tcp:8080`, and use
`EXPO_PUBLIC_EDITOR_API_URL=http://127.0.0.1:8080`; Metro still needs
`adb reverse tcp:8081 tcp:8081`. Do not expose the loopback binding publicly.
Use HTTPS for a remote private endpoint. Adding `expo-audio` requires an APK
rebuild; if `app-client/android` needs regeneration, use ordinary Expo prebuild
without a clean wipe. YouTube smoke checks must use content the user owns or is
allowed to use; login, bot, and access restrictions are not bypassed.

Cloudflare uploads are a possible later feature and are outside this local flow.
From the Library, **Add to board** can append a sound as a new board slot or
open a numbered picker for the original 16 pads. It prompts before replacing an
occupied assignment. Removing an assignment restores its default sound;
deleting a library clip clears all its assignments. Missing local clips fall
back to pad defaults. The mapping and clip files are local to the app, and this
feature writes no files to R2.
The sections below retain the prior remote soundboard and ingest design for
context; read this amendment as current wherever the older design differs.

---

## 1. Objective

A personal soundboard: a grid of pads on an Android phone that fire short meme
sounds instantly, plus local in-app authoring that turns a permitted source URL
into a trimmed, offline-playable phone clip.

**The real objective is learning asset management.** Where two designs compete,
prefer the one that exposes asset-pipeline concepts — masters and derivatives,
renditions, content addressing, ingest job state, storage lifecycle, cache
behaviour — over the one that ships fastest. This is not a product and will not
be monetised.

Several decisions below are deliberately *not* the pragmatic choice. They are
marked **[learning choice]** with the cost stated, so future-me knows the
tradeoff was made on purpose.

---

## 2. Shape

```
                     ┌──────────────────────────────┐
   paste URL ───────▶│  Editor (PWA, responsive)    │
                     │  waveform · handles · loop   │
                     └───────────────┬──────────────┘
                                     │  ingest / render
                                     ▼
                     ┌──────────────────────────────┐
                     │  Droplet ($5 DO, 1GB)        │
                     │  API · SQLite · worker       │
                     │  yt-dlp · ffmpeg · temp fs   │
                     └───────────────┬──────────────┘
                                     │  upload
                                     ▼
                     ┌──────────────────────────────┐
                     │  Worker + Cloudflare R2      │
                     │  public reads · private data │
                     └───────────────┬──────────────┘
                                     │  direct Worker fetch
                     ┌───────────────┴──────────────┐
                     │  Soundboard (React Native)   │
                     │  home board · search · pads  │
                     └──────────────────────────────┘
```

Two thin clients, one server, one bucket. The editor and the soundboard are
separate apps because their requirements are opposed:

| | Editor | Soundboard |
|---|---|---|
| Frequency | rare, batch, sit-down | constant, in-the-moment |
| Precision | ±10 ms handle dragging | one blunt thumb |
| Latency | irrelevant | everything |
| Network | always online by definition | streams per tap (see §6) |

### Invariant: the droplet is never on the playback path

Manifest is cached locally; clip URLs are public and content-addressed. The
droplet can be rebooting, OOM-killed, or half-refactored and **the soundboard
still works** — only ingest stops. Do not break this. It is what makes it safe
to hack on the server.

---

## 3. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Client platform | **React Native on Android** (PLAN A1) | Native playback was proven early with `react-native-audio-api`; the Android client is built as a custom Expo development build because Expo Go cannot load the audio module. |
| 2 | Output target | Phone speaker, into the room | Not into calls — no OS allows injecting audio into another app's mic stream. If that were ever the goal, the project would have to be desktop. |
| 3 | Server | Existing $5 DO droplet | 1 GB / 1 vCPU / 25 GB, **shared with another project**. See §7. |
| 4 | Sources | Direct-file first, yt-dlp behind the same interface | myinstants-class sources are static MP3s behind a UA check — trivial and unbreakable. YouTube is the fragile path and must degrade gracefully, not take the app down. |
| 5 | Master retention | **Discard after render** — the clip is the master | **[learning choice]** Forces real lifecycle work: TTL sweeps, abandoned-session cleanup, orphan detection, failure paths where the master is already gone. Cost: the codec choice becomes permanent, and re-editing depends entirely on decision #13. |
| 6 | Permanent storage | Private Cloudflare R2 bucket behind a read-only Worker | R2 provides 10 GB free, S3 compatibility and **zero egress**. The Worker exposes immutable, content-addressed reads without exposing the bucket endpoint or credentials. Clips remain off-droplet, so a rebuild can't destroy the library. |
| 7 | Trim UI | Waveform + draggable handles | Plus live-looping selection and ±10/±100 ms nudge buttons. |
| 8 | Sync | **Online-first — stream per tap** | **[learning choice]** Full-mirror is 54 MB and obviously better as a product. Chosen to learn cold-path optimization and its caveats. See §6. |
| 9 | Playback | Monophonic, retrigger from 0 | Airhorn spam must work. New pad cuts the current one. Persistent kill-bar while playing. |
| 10 | Navigation | Stable home board + search replaces grid | Muscle memory for the ~16 sounds used constantly; search for the long tail. |
| 11 | Authorization | Public Worker clip URLs, private bucket, authenticated manifest | Presigned URLs would put the droplet on the cold path (+50–200 ms per first tap) — building the exact latency problem #8 exists to solve. The Worker is the public read boundary; the app never receives R2 credentials or an R2 bucket endpoint. |
| 12 | Persistence & jobs | SQLite for metadata *and* the job queue | **[learning choice]** BullMQ would hide atomic claim, lease recovery, backoff, dead-lettering — the concepts worth learning. Also near-zero RAM, which #3 requires. |
| 13 | Renditions | Tight clip + **±4 s padded edit copy** | Restores re-editability that #5 gave away. Phone fetches the tight one; only the editor fetches the padded one. |
| 14 | Codec | AAC-LC, mono, 44.1 kHz, 64 kbps, loudness-normalised | Opus would save ~6 KB/clip — noise against a 100–500 ms radio wake — while making the permanent choice from #5 riskier. Mono because a phone speaker has one driver. |

---

## 4. Data model

```
Source  (master — transient, deleted after render)
├── id
├── kind: 'youtube' | 'direct' | 'upload'
├── sourceUrl
├── canonicalId          ← YouTube video ID etc. Dedup key: ingest twice = one Source
├── title, durationMs
├── tempPath, byteSize, contentHash
├── state: pending → fetching → ready | failed
└── fetchedAt, expiresAt  ← 24 h TTL

Clip  (derivative — permanent, the real archive)
├── id, sourceId
├── trimStartMs, trimEndMs        ← the recipe
├── padStartMs, padEndMs          ← actual handle amounts after clamping
├── gainDb, fadeInMs, fadeOutMs, normalize
├── clipKey    → clips/<sha256>.m4a   tight,  ~24 KB
├── editKey    → edits/<sha256>.m4a   padded, ~88 KB
├── contentHash, byteSize
└── renderState

Pad  (presentation — deliberately separate from the asset)
├── clipId
├── name, tags[], color
├── gridPos, pinned
└── playCount, lastPlayedAt        ← drives prefetch ranking
```

**Why `Pad` is separate from `Clip`:** rearranging the home board touches
`gridPos` only and never goes near an asset. One clip can appear on multiple
boards. Renaming is metadata, not a re-render. Systems that conflate these
become painful exactly when it matters.

**Why keys are content hashes:** an edited clip produces different bytes ⇒ a
different hash ⇒ a different key ⇒ a different URL. Stale content becomes
*impossible by construction*. Cache invalidation stops being a problem to solve
and becomes one that doesn't exist. This also makes re-running a half-finished
job idempotent for free.

---

## 5. Ingest pipeline

```
  URL
   │
   ▼
 [enqueue]────────────────────────────── SQLite jobs table
   │
   ▼
 fetch ──────────► temp on droplet disk (24 h TTL)
   │               audio-only, never video (~1 MB/min)
   ▼
 probe + peaks + low-bitrate preview
   │
   ▼
 EDIT SESSION ── scrub against the *preview*, never the master
   │             live-loop selection · ±10/±100 ms nudge
   ▼
 render ──────► clips/<hash>.m4a   (tight)
        └─────► edits/<hash>.m4a   (±4 s, clamped to source bounds)
   │
   ▼
 upload to R2 ──► manifest version++ 
   │
   ▼
 GC: delete temp on commit, or on TTL if the session is abandoned
```

### Adapters behind one interface

```
POST /ingest { url }
  ├─ direct-file   fetch with browser UA; is it audio/*?          ← build first
  ├─ html-scrape   parse <audio src> / og:audio                    ← build first
  ├─ upload        multipart from device
  └─ yt-dlp        YouTube etc.                                    ← build last
```

A yt-dlp failure must surface as *"that URL didn't work, try uploading the
file"* — never as a broken app.

### Queue semantics to implement by hand

These four are the point of decision #12:

1. **Atomic claim** — `UPDATE jobs SET state='running', leaseUntil=? WHERE id=(SELECT id FROM jobs WHERE state='pending' ORDER BY id LIMIT 1) RETURNING *`
2. **Lease recovery** — a job stuck in `running` past `leaseUntil` is reclaimable
3. **Retry with backoff**, then a **dead-letter** state after N attempts
4. **Idempotency** — content addressing means a re-run overwrites the same key

`PRAGMA journal_mode=WAL`. Concurrency **1** — which doubles as the OOM guard
from §7.

**Known limit:** SQLite is single-writer, so this does not scale to multiple
worker machines. Irrelevant at this size, and knowing precisely where the wall
is beats not knowing it exists.

---

## 6. Latency — the core learning exercise

Decision #8 puts the network in the playback path on purpose. This is the budget
to attack:

```
radio wake (idle cellular)   100–500 ms   ← the one nobody expects
DNS + TLS (cold)              50–300 ms
TTFB from R2                  30–150 ms
transfer 24 KB                 ~5–40 ms
decode                         5–15 ms
─────────────────────────────────────────
cold total                  ~200 ms – 1 s
warm total                    ~10–20 ms
```

**Target: p95 < 150 ms.** ~100 ms is roughly where cause and effect stop feeling
connected; past ~250 ms comedic timing is dead.

### The sleeping-radio trap

A phone's modem drops to low power after a few seconds idle, and waking it costs
real time before a byte moves. This app is pathologically shaped to hit it: open,
stare at the grid for ten seconds deciding, then tap. **Invisible on wifi and at
a desk.** Test throttled, on cellular, cache disabled.

### Retrigger is free

Once fetched and decoded, spamming a pad is a pure memory operation. So the
entire cost is the **cold first tap of each sound** — a much narrower target
than "the network is in my hot path".

### Optimization ladder

1. `Cache-Control: immutable, max-age=31536000` — free, because keys are content hashes
2. Cloudflare edge caching for Worker-backed R2 reads
3. `preconnect` on app load — pay DNS/TLS before the first tap
4. Viewport prefetch — warm pads as they scroll in
5. Frequency-weighted prefetch of the home board on launch (16 × 24 KB ≈ **384 KB**)
6. Keepalive ping to hold the radio awake while foregrounded — ugly, effective, instructive battery tradeoff
7. Service worker with an explicit cache policy

**Step 7 is a local cache.** Followed honestly, this ladder converges on the
full-mirror design that was rejected in #8. That is the lesson, not a failure —
arriving there having measured why each rung was necessary is the entire point.

### Instrument before optimizing

Build this first, in M0. Record `pointerdown → first audible sample` on every
play, tagged with cache hit/miss and connection type. Ship to the droplet, chart
p50/p95. The distribution will be bimodal — fast warm taps, brutal cold ones —
and **all the pain lives in the p95**. Without this, every rung above will feel
like it helped.

---

## 7. Droplet constraints — protecting the other project

1 GB RAM shared with an existing app. The OOM killer picks its own victim, which
may be **the other project**. Non-negotiable:

| Mitigation | Why |
|---|---|
| Add 2 GB swap | DO ships none. Prevents most OOM kills. ~2 min setup. |
| `systemd MemoryMax=` on this service | Hard ceiling ⇒ *this* project dies, not the other one. The single most important line. |
| Fetch `bestaudio` only | ~1 MB/min, not ~50 |
| Queue concurrency = 1 | Two ffmpeg processes will not fit |
| Stream to disk; never `readFile` a master into a Buffer | yt-dlp and ffmpeg already stream — the spike is almost always your own code |
| Reject sources > ~20 min | Cheap bound on pathological input |
| Worker as a **separate process** from the API | `better-sqlite3` is synchronous and blocks the event loop; an ffmpeg crash then takes the worker, not the API |

Storage on the droplet is temp-only. Permanent bytes live in R2.

---

## 8. Playback engine

- Trigger on **`pointerdown`, not `click`.** Click fires on release — 100 ms+ of dead air on touch, and the most common reason a web soundboard feels sluggish.
- **`AudioBufferSourceNode` is single-use.** Each retrigger creates a fresh node over the same decoded buffer (sub-millisecond).
- **~5–10 ms fade on the outgoing voice**, or every retrigger clicks. So there are briefly two nodes alive: "monophonic" is really *one logical voice with a short crossfade*. **Gain node per voice**, not one shared — retrofitting this later is painful.
- **No debouncing.** Spamming faster than the clip length gives the machine-gun effect. That's the airhorn aesthetic.
- **LRU of ~30 decoded buffers.** Decoded PCM is far larger than the encoded file; mono at 44.1 kHz roughly halves it. Decode of a short clip is 5–15 ms, so a miss on `pointerdown` stays imperceptible.

---

## 9. Navigation

**Home board** — ~16 pads, positions frozen. Muscle memory. Edited via ⋯ → Edit
→ drag (a `Pad.gridPos` change; never touches an asset).

**Search** — replaces the whole grid; clearing returns home.

- **Metadata is local even though audio isn't.** ~200 bytes/clip ⇒ a 200-sound manifest is **~40 KB**. Mirror it. Decision #8 applies to the *bytes*, not the *catalog* — network latency in navigation as well as playback would be intolerable.
- **Deterministic ordering.** Same query ⇒ same arrangement, always. The query becomes the coordinate: type "horn", it's always second. Stable sort on (match rank, id).
- **Substring + tag matching, not fuzzy.** At 200 items fuzzy mostly buys surprising results; predictability is worth more in a tool used fast.
- **Search concentrates the cold-tap problem** — it surfaces exactly the long-tail sounds not in the prefetch set. Mitigation: prefetch the first row or two as results render. High hit rate, since one of them is about to be tapped.
- **The keyboard eats half the screen.** Design results for ~6–8 visible pads, or dismiss the keyboard once results render.

The home board *is* the prefetch working set. UX structure and caching strategy
are the same decision — a sign the design is sound.

---

## 10. Milestones

Each is independently useful. Do not build the editor before something can play
its output.

- **M0 — Playback shell.** Versioned bootstrap manifest + grid + tap-to-play,
  private R2 hand-seeded with ~5 clips served through the read-only Worker.
  **Instrumentation from day one.** Proves the hot path and starts the latency
  dataset. The bootstrap manifest may be public during M0; M1's authenticated
  API becomes the canonical manifest source.
- **M1 — Service skeleton + pipeline end-to-end.** SQLite jobs table, separate
  worker, direct-file adapter, whole file rendered to AAC, uploaded, manifest
  bumped, authenticated manifest and metrics endpoints. Proves the pipeline
  against a source that should not break.
- **M2 — YouTube adapter.** Behind M1's existing adapter interface. Expect bot
  challenges from a DO IP — cookies first, residential proxy only if it becomes
  annoying.
- **M3 — Editor.** Waveform, peaks, preview rendition, draggable handles, live
  loop, nudge buttons, dual render (tight + ±4 s padded), GC of temp and nightly
  SQLite backup.
- **M4 — Navigation.** Home board, pinning, ⋯ → Edit reorder, local manifest,
  stable search and result prefetch.
- **M5 — Optimization.** Climb §6's ladder against measured p95, one rung at a time, keeping the numbers.

---

## 11. Known limits, accepted deliberately

- **Codec is permanent.** Masters are discarded (#5), so AAC 64 kbps mono is forever. Re-encoding later is lossy-to-lossy.
- **Handles bound re-editability.** ±4 s of nudge room, then the audio is genuinely gone.
- **Capability URLs can't be revoked** without re-keying the object. A leaked URL — screenshot, log — leaks that clip permanently. Fine for public meme audio.
- **Single-writer SQLite** — no horizontal scaling of workers.
- **yt-dlp from a datacenter IP will be fought** by YouTube, increasingly over time. It is deliberately not on the critical path.
- **Respect YouTube's terms and access restrictions.** Private, personal, non-commercial use only; this is not a public product with a signup page.
- **Remote comparison clips remain online-first** by choice (#8). The local-authoring pivot adds offline playback for user-created clips only; it does not mean the remote file-cache ladder is complete.

---

## 12. Open

- Manifest auth: static bearer token in the app. Sufficient for single-user; revisit only if the board is ever shared.
- Distribution remains a sideloaded Android APK; revisit a Play internal track only if sideloading becomes tedious.
