# Reproducible combined release image

This opt-in builder produces one local `linux/amd64` image containing the
Soundboard API and worker plus the pinned Imli server. It exports a minimal
context from this Soundboard checkout and fetches the Imli commit in
`lock.json`; it never uses a machine-specific `E:\Imli` path or depends on
`soundboard-service:local`. The normal `sb` and Compose workflows are unchanged.

The host needs Node 24, Git, and Docker Buildx. Git must already be able to
fetch the private Imli repository with its configured credential helper. Fetch
is noninteractive (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=Never`) and the
builder never prints Git stdout/stderr or puts credentials in arguments or the
context. It does not change Git credential configuration. The exported context
contains only allowlisted source and manifests; `.git`, `.env`, host
dependencies, generated output, tests, and fixtures are excluded. Symlinks and
secret-like filenames in selected source trees stop preparation.

From a clean checkout, build and load the image into the local Docker engine:

```powershell
node .\deploy\shared-imli\release\build.mjs
```

The command prints a JSON report with the local tag and image ID, both source
revisions, source inventory hash, manifest hash, and publishable status. It
does not push. The tag includes both source revisions and the generated release
manifest hash.

To preserve and inspect a standalone build context without running Docker:

```powershell
node .\deploy\shared-imli\release\build.mjs --prepare-only --output .\data\shared-imli-release
```

An explicitly selected output must be a new or empty directory. Existing
nonempty directories and symlinked output paths are refused. Checkout-local
outputs must be under ignored `data/`; otherwise use a path under the system
temporary directory. The builder removes only its own newly created scratch
directory. With `--output`, the generated context is retained for inspection
and can be used directly with Docker Buildx.

The normal builder refuses any dirty checkout. For local verification only,
pass `--allow-dirty`. This labels the artifact `publishable:false` even when
dirty files are unrelated to the exported inputs; the manifest inventories the
SHA-256 of every exported source file, plus the packaging Dockerfile and
runtime supervisor/gateway. Never promote such an image as a release.

## Build contents

Both repositories build independently on the same digest-pinned Debian Node
24 base. Soundboard uses the Yarn version in its package manifest, immutable
lockfile installation, native `better-sqlite3` build tools, and a focused
production workspace install. Imli uses its separate dependency tree under
`/imli`. The runtime runs as the nonroot `node` user and uses `tini` to manage
the existing supervisor. `ffmpeg`, `curl`, and CA certificates are installed;
the `linux/amd64` yt-dlp binary is downloaded from its fixed official release
URL and checked against the SHA-256 in `lock.json`. API/worker paths and the
port-4000 gateway routing are kept as implemented in `gateway.mjs` and
`supervisor.mjs`.

The generated context is the build contract: `release-manifest.json` records
the selected commits, publishable status, build pins, and each source input's
SHA-256. The image carries source revision, manifest hash, and publishable
labels. Project test source and synthetic fixture tools are deliberately absent
from the shipped application code; upstream dependency packages are not audited
for their own test files.

## Limits

The source inputs, Node base image, Yarn versions, and yt-dlp artifact are
pinned and traceable. This is not a byte-identical build: Debian package
indexes and package versions are fetched from mutable repositories during the
Docker build. Reproducible inputs do not imply deterministic image bytes until
those OS packages are also snapshotted. Docker and the build process must be
run on a host with access to GitHub and the configured Imli credential helper.

The local step 1 build and fixture run are recorded in
[`VERIFICATION.md`](VERIFICATION.md). That verification image came from a dirty
checkout and is not publishable; it demonstrates the packaging path, not
production readiness. A fresh build from a reviewed clean commit plus
deployment safeguards and target-host checks remain necessary.

The step 2 local image preflight and target-host procedures are documented in
[`../ops/README.md`](../ops/README.md) and [`../ops/RUNBOOK.md`](../ops/RUNBOOK.md).

Run the focused packaging checks with:

```powershell
node --test .\deploy\shared-imli\release\build.test.mjs
```
