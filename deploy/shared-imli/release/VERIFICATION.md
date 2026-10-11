# Release packaging verification — 2026-10-11

Step 1's release builder and isolated fixture harness were verified locally
against the built image. This confirms the packaging path and this test run; it
does not establish production readiness or capacity.

## Image and source identity

- Image: `soundboard-imli:fdf1c2933d46-960119f14fc8-b6f1a9ca39a9`
- Local image ID: `sha256:fe86cf64a6baf9cb0c4ecf83bd9cecf27f4a020c63c39acc5bf26149346862b9`
- Release manifest SHA-256: `b6f1a9ca39a981b3e66024e65d9ff73c3b5133adbdbe75f07ee626193a3a187c`
- Soundboard revision: `fdf1c2933d46a5a9d244df2e6a0c2775b7daeed6` (`dirty: true`,
  `publishable: false`)
- Imli revision: `960119f14fc86ca7e108f35b457aaf7d24e6011e`, fetched from the
  credential-free HTTPS repository URL in `lock.json`; no local Imli checkout
  or `soundboard-service:local` image was used.
- Build platform and pins: `linux/amd64`, digest-pinned Node 24 base, and
  yt-dlp `2026.08.19` with its locked SHA-256 verified.

The runtime used Node 24.21 and UID 1000. The SQLite and bcrypt native bindings
loaded successfully. Inspection of shipped application code and runtime-support
directories (`/app/shared/dist`, `/app/service/dist`, `/imli/build`, and
`/opt/shared-imli`) found no local `.env`, Git history, project test files, or
fixture tools. Third-party dependency packages were not comprehensively audited;
the Imli runtime retains its development dependency tree. The release manifest
audits the exported source inputs by SHA-256.

## Checks and local resource run

- All 7 release packaging tests passed.
- All 8 gateway and supervisor tests passed against the new image.
- The isolated fixture harness and resource checks passed all 36 checks.
- The harness recorded 1,773 timed operations with 0 operation failures.
- The gateway ran with a 512 MiB memory limit, no swap, and a one-core CPU
  limit. Its cgroup lifetime peak was 225 MiB; all OOM counters were zero and
  Docker reported no OOM kill.

The harness used synthetic Mongo rows and local generated AAC. Its near-limit
source was a 1,199-second synthetic fixture; it did not contact YouTube. These
results describe this run only and do not establish target-host headroom or
production capacity. Docker removed the test containers, network, and Mongo
fixture volume afterward. The existing Soundboard containers were untouched,
and the Imli working tree remained clean.

The runner's full ignored JSON report is available locally at
[`data/shared-imli-release-step1-report.json`](../../../data/shared-imli-release-step1-report.json).

## Remaining release work

This verification image came from a dirty Soundboard checkout and is marked
`publishable: false`. Build a fresh image from the reviewed clean commit before
release. OS package repositories remain mutable during Docker builds, so this
flow pins and audits inputs but does not promise byte-identical image builds.
Deployment safeguards and target-host health, load, rollback, and monitoring
checks remain pending. Review, commit, push, and deployment require user
approval.
