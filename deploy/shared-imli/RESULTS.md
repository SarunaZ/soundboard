# Shared Imli + Soundboard prototype results

**Run date: 2026-10-10.** This records local prototype checks only. It is not a
production capacity result or an AppPlatform deployment approval.

## Build and runtime checks

The combined image built successfully from the local Soundboard base image and
an allow-listed Imli named context. The Imli repository's HEAD commit prefix
was `960119f`, and its working tree was clean before and after the build. The
Node runtime unit suite passed 8/8 checks in Linux; the existing Soundboard
service suite passed 6/6.

The isolated fixture harness passed all 36 assertions. Its fake yt-dlp created
local synthetic audio with FFmpeg and made no network requests. It covered
editor authentication and malformed input, ranged previews, cleanup, repeated
short renders, a 1,199-second source, and a 60-second AAC render. The harness
ran four concurrent clients for 24.035 seconds while the near-limit source was
processed and the long render ran. Across 1,708 timed operations there were no
failures. Load latency p95 was 3.69 ms for health, 3.80 ms for GraphQL, and
17.92 ms for the Mongo-backed read.

The container was limited to 536,870,912 bytes for memory and memory-plus-swap,
with one CPU. The sampler saw a 235,610,112-byte lifetime cgroup peak (about
224.7 MiB), a 173,125,632-byte sampled current-memory peak, and a
158,482,432-byte sampled working-set peak. The container was not OOM-killed,
and every reported cgroup
OOM counter remained zero. Host file cache affects cgroup current memory, and
per-process RSS values are not additive; they should not be used to infer a
production memory budget.

An earlier diagnostic attempt reported 513,994,752 bytes (about 490 MiB) while
the host sampler launched a Node process for each poll and Node health checks
were also running. That attempt failed the harness and was superseded after the
sampler was corrected. It is not a valid completed workload measurement, but
it demonstrates that measurement overhead can materially change the observed
peak. The separate live-source run below peaked at 285.9 MiB; that lower number
does not supersede the higher diagnostic observation as a general capacity
claim.

## Live source and concurrent request check

A separate run used the same combined image and the same 512 MiB memory and
one-CPU limits, with network access for yt-dlp and an isolated local MongoDB
seeded with 1,000 synthetic rows. yt-dlp 2026.08.19 processed two permitted
public sources without cookies or access bypass:

- Shorts video `jlPQtJXy9t8`: source duration was 54,621 ms; a 0–2,000 ms clip
  rendered, and preview/clip HTTP Range requests returned 206 with a 32-byte
  body.
- Watch video `OjNpRbNdR7E` supplied with a playlist parameter: the playlist was
  discarded during canonicalization; source duration was 374,421 ms. A
  1,000–3,000 ms clip rendered as AAC mono 44.1 kHz at 2.000 seconds; the
  preview Range request returned 206 with a 32-byte body.

Four clients ran for 30 seconds against health, GraphQL, and the read-only
Mongo route: 1,088 requests per endpoint, 3,264 total, all successful. The
respective p95 latencies were 3.4105 ms, 3.7328 ms, and 7.4851 ms; maximum
latencies were 41.03 ms, 24.09 ms, and 49.70 ms. The total cgroup peak was
299,765,760 bytes (about 285.9 MiB). The container was not OOM-killed and the
maximum, OOM, and OOM-kill event counters stayed at zero.

The near-limit fixture tests duration, not maximum input size: the generated
source did not reach the 32 MiB file limit (the largest input was about 14 MB).
The live-source run used a temporary network path for access to YouTube; the
fixture harness used its separate internal network. Both runs used synthetic
Mongo data. The test containers, networks, temporary database, and media data
were removed afterward; the existing application services were left running.

## Limits and next deployment work

The result shows that these completed workloads stayed under the configured
local 512 MiB cap. It does not establish production headroom: production Imli memory,
Mongo data, host cache, request mix, and background activity differ from this
run. This was a short exercise, not a soak test, and did not exercise production
authentication, email, AI, or production database workloads. Rendering still
shares one memory cap with Imli and both Soundboard processes, so concurrent
heavy activity can still trigger a shared-container OOM. The instance has one
process per role, and session/database/temp paths are ephemeral without
deployment volumes. Worker readiness and monitoring have not been designed;
production deployment needs health visibility and alerting for the editor
worker as well as the public gateway.

The combined local image is about 1.45 GB. It is not ready for AppPlatform: its
build depends on a local base image tag and a second repository supplied as a
BuildKit named context. Before
deployment, publish and pin a versioned artifact/build flow that carries both
repositories without including Imli's environment file, then validate it in a
staging environment with rollback; image-size optimization may also be needed.
A full 32 MiB input run, longer soak under
representative traffic, production-host memory measurement, and real-phone
client checks have not been performed. No deployment or push was performed for
this prototype.
