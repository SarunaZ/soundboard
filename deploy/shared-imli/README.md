# Shared Imli + Soundboard local prototype

This is an opt-in, one-container experiment. The normal Soundboard Dockerfile
and `docker-compose.yml` remain the default workflow. The combined image layers
the Imli server over the existing `soundboard-service:local` image, so build the
base image first from the repository root:

```powershell
docker compose build api worker
docker buildx build --load `
  --file deploy/shared-imli/Dockerfile `
  --build-context imli="E:\Work\dev\imli-system\app-imli-server" `
  --tag soundboard-imli-prototype:local .
```

The named Imli build context is deliberately limited in the Dockerfile to
`package.json`, `yarn.lock`, `.yarnrc.yml`, `tsconfig.json`, and `src/`. It does
not copy `.env`, `.yarn`, generated build output, or host `node_modules`. Imli
dependencies are installed in an isolated Debian Node 24 build stage with Yarn
4.6.0 and the `node-modules` linker. Its runtime tree lives under `/imli`, apart
from Soundboard's `/app` dependencies. BuildKit named contexts are local build
inputs; this is not a versioned artifact that another deployment system can
rebuild from the Soundboard repository alone.

The container's only published listener is the gateway on port 4000. Exact
`/editor` and `/editor/*` paths, including their query strings, go to the
Soundboard API on loopback port 8080. Every other path goes to Imli on port
4001, so `/health` continues to mean Imli health. The gateway streams requests
and responses, preserves authorization and range headers, strips hop-by-hop
headers, and returns 502 when an upstream is unavailable. The gateway adds no
separate editor authentication layer; the API enforces its editor token. The
release image's unauthenticated status endpoints are documented in
[ops/RUNBOOK.md](ops/RUNBOOK.md). API and worker run as separate child processes. Imli,
API, and worker get independent restart handling; shutdown allows a short
grace period and then kills tracked process groups, including detached media
tools.

For the isolated fixture/load exercise, build the image above, then run:

```powershell
.\deploy\shared-imli\test\run.ps1
```

The integration harness uses its own Mongo 7 container, seeded only with
synthetic rows, and the copied fake yt-dlp fixture. The fixture is used only
when `YTDLP_BIN` is explicitly set by the test compose file; normal runtime
defaults continue to use the Soundboard image's real yt-dlp. The runner's
report describes that local 512 MiB memory-cap exercise, not production
capacity.

The prototype has no persistent session storage configured by default. SQLite
is written below `/data` and temporary media below `/var/tmp/soundboard`; attach
appropriate local volumes if you need to retain a development session. It is a
single-instance design, and editor rendering shares the 512 MiB cap with both
application servers. The versioned release flow supersedes this prototype's
local named build-context and `soundboard-service:local` packaging prerequisites.
It does not change the prototype's storage limits or establish platform
readiness. The local preflight correctly rejected the dirty, non-publishable
image; fixture load and fault-injection checks passed. Production monitoring,
App Platform health settings, and target-host checks remain pending. See the
[ops verification](ops/VERIFICATION.md).

The dated measurements, integration coverage, and remaining limits are recorded
in [RESULTS.md](RESULTS.md).

The versioned release packaging path is documented in
[`release/README.md`](release/README.md). After building a local release image,
the existing isolated fixture harness can exercise it with
`deploy/shared-imli/test/run.ps1 -ReleaseImage <image-reference>`; see the
[test runner notes](test/README.md). Release packaging and target-host
verification status are tracked in the repository's [steps checklist](../../STEPS.md).
The local step 1 result is recorded in [release verification](release/VERIFICATION.md).
Step 2 operational guidance is in [ops/README.md](ops/README.md) and
[ops/RUNBOOK.md](ops/RUNBOOK.md).
