# Shared Imli operations

The release preflight checks a locally available combined image before any
future registry publication. It is a provenance and deployment check, not a
security audit or a production-readiness guarantee.

```powershell
node .\deploy\shared-imli\ops\preflight.mjs --image soundboard-imli:<local-tag>
node --test .\deploy\shared-imli\ops\preflight.test.mjs
```

The command requires Docker and a local image. It inspects platform, runtime
user, tini entrypoint, Docker readiness healthcheck, release labels, and the
resolved image ID. It reads only `/opt/shared-imli/release-manifest.json` from
that resolved ID using a temporary container with `--pull=never`, `--network=none`,
`--read-only`, dropped capabilities, no-new-privileges, and bounded
memory/process count. Manifest source revisions, publishable/dirty state,
release lock hash, and build pins are checked against labels and the local
release lock. Output is safe JSON with check names, short details, and the image
ID; full Docker inspect metadata, environment values, and command errors are
not printed. It intentionally rejects dirty or non-publishable images without
an override.

This does not contact a registry, push, deploy, or inspect the running Imli
service. These are provenance and deployment checks, not a container security
audit or proof of production readiness. See the [target-host runbook](RUNBOOK.md)
for release, rollout, and rollback procedures, the [verification record](VERIFICATION.md)
for local step 2 status, and the [parent deploy notes](../README.md) for the
fixture harness.
