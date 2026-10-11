# Shared container integration harness

This harness is isolated from the normal Soundboard compose project. It uses a
fixture `yt-dlp` executable and local generated audio; it never contacts
YouTube. The `soundboard-imli-test` compose project has its own MongoDB and no
host published database port.

The entry point is `deploy/shared-imli/test/run.ps1`. From the repo root, first
build `soundboard-imli-prototype:local` as described in
`deploy/shared-imli/README.md`, or build a release image as described in
[`deploy/shared-imli/release/README.md`](../release/README.md). PowerShell 7.0
or newer is required. To run against the prototype, use:

```powershell
.\deploy\shared-imli\test\run.ps1
```

To run the same harness against a locally built release image, pass its image
reference explicitly. Use the `tag` printed by `release/build.mjs`:

```powershell
$releaseImage = 'soundboard-imli:<tag-from-build-output>'
.\deploy\shared-imli\test\run.ps1 -ReleaseImage $releaseImage
```

Release mode selects the supplied image only in Docker Compose child processes.
It does not retag or replace the prototype image. A Compose override mounts the
existing fake yt-dlp fixture read-only for this test run and disables Compose's
init wrapper because the release runtime already uses tini. The fixture is not
part of the final release image. Compose receives a temporary empty env file so
it does not interpolate the repository's local `.env` values.

The harness runs API and fixture media checks, then Imli GraphQL and Mongo read
smoke under concurrent load. It writes the full JSON report under the host
temporary directory (override with `-ReportPath`) and prints a short result
line. The API is bound on host loopback port 18081 for manual inspection.
MongoDB uses a fresh project-scoped test volume, which the runner removes at
exit; no application data volume is reused.

Each run uses a new project name beginning `soundboard-imli-test-`, then removes
only that run's containers, network, and MongoDB fixture volume when it exits.

The GraphQL operation introspects only `__typename`; the only database-backed
operation is the read-only paginated `/api/get-cheeks` route against 1,000
synthetic rows in the isolated test MongoDB. No mutations are issued. The
harness does not submit email, auth, or AI requests.

Results describe this local fixture run, not a production load guarantee. Host
memory pressure, Docker Desktop's VM allocation, and storage characteristics
can differ materially from the production machine.

For the bounded release soak and health fault checks, see the runner's
`-Safeguards`, `-SoakSeconds`, and `-FaultChecks` options and the
[operations runbook](../ops/RUNBOOK.md).
