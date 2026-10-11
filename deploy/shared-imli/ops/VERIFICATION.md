# Shared Imli operations verification — 2026-10-11

Step 2's local safeguards, load, and fault-injection checks passed on the final
combined image. This verifies the isolated local workflow; production monitoring,
App Platform health settings, and a target-host rollout remain pending. No
registry push, commit, or deployment was performed.

## Final local artifact

- Image: `soundboard-imli:fdf1c2933d46-960119f14fc8-c037488a6118`
- Local image ID: `sha256:3346232bcb2c92927e19d7c88d86b6cc949b3467ec6b80b0d9793f63a1b8470f`
- Release manifest SHA-256: `c037488a61182253404c0f5ee53c8cf6b86eca804930633ac1bf20b3366ac79b`
- Source inventory SHA-256: `d394a65bf5771949acf868275e68fadb07d7683c69083b0672354d32a91f70d2`
- Final prepared context: `data/shared-imli-release-step2-final`
- Repeating the export produced the same source inventory hash.
- Docker inspection confirmed the runner's resolved image ID matched the ID above.

The local image was built from a dirty Soundboard checkout. Preflight correctly
exited 1 because the image was `publishable:false` and the manifest marked the
Soundboard source dirty; its other 14 checks passed. No override was used. This
image demonstrates the safeguards and fixture checks, not a publishable release.

## Verification results

The final report at `data/shared-imli-release-step2-verified-report.json` passed
all 365 checks with zero failures. It contains 352 harness assertions and
44,116 timed operations with zero request failures. The requested 300-second
soak ran for 303.01 seconds: 101 cycles and 303 renders.

The harness covered API and Imli health/GraphQL reads, concurrent fixture load,
render and duration boundaries, cleanup, source-size boundary handling, and fault
recovery. The exact 33,554,432-byte source was a three-second PCM16 WAV padded
with trailing zero bytes; it reached ready and served a ranged preview. The
33,554,433-byte input was rejected with the byte-limit error, produced no
preview, and a subsequent valid editor session recovered. This padded PCM size
boundary is not equivalent to a 32 MiB complex-media stress case. The separate
near-limit source was 1,199 seconds. The 60-second requested trim rendered and
was served as AAC; no claim is made that ffprobe confirmed an exact 60-second
output duration.

All six worker fault checks passed:

- `SIGSTOP` stopped worker PID 17 in state `T`; shared readiness returned 503
  while Imli `/health` remained 200.
- After the five-second heartbeat freshness window elapsed, readiness remained
  503 when checked one second later.
- `SIGCONT` resumed PID 17 and readiness recovered to 200.
- `SIGKILL` caused a worker restart under PID 9995 and readiness returned 200.

Across 96 memory samples, observed peak working set was 207,769,600 bytes and
lifetime peak was 218,460,160 bytes. The container had a 512 MiB memory limit,
no extra swap, and a one-CPU quota. OOM and OOM-kill counters were zero; the
final post-fault memory sample was included. The existing target is configured
for 512 MiB and one shared vCPU. A local one-CPU quota does not simulate shared
vCPU contention or establish production capacity or memory headroom.

Additional completed checks: 13 Linux runtime checks, 8 packaging tests, 7 ops
preflight tests, 4 runner tests, 3 worker-heartbeat tests, and TypeScript
validation passed. The full service suite passed 8 checks and skipped one
existing fixture-dependent check.

## Earlier failed experiments

The earlier report `data/shared-imli-release-step2-report.json` records an
integration attempt whose fixture generated 12-character IDs where the API
requires 11; the fixture was corrected and a regression test added. The report
`data/shared-imli-release-step2-final-report.json` records the first 300-second
run, where three fault checks failed because the release container image had no
`kill` executable (`spawnSync` returned `ENOENT`) and the Docker exec signals
were never applied. The runner was corrected to send signals through Node and
verify stopped process state and replacement PID. Both failed reports are
preserved; the passing verified report supersedes them for the final local
result.

## Still pending

Production deployment safeguards are not exercised. The existing `urchin-app`
service's `app-imli-server` configuration, health-check settings, target-host
monitoring, and rollback readiness still require review and explicit approval.
The production Imli service and Imli working tree were not changed; no target
deployment, App Spec update, push, or commit was made.
The test project cleanup completed with no test containers, networks, or volumes
remaining.
