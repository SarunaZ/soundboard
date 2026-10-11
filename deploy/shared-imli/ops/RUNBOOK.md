# Shared Imli release runbook

This runbook covers the combined Soundboard API + worker and Imli image on the
existing DigitalOcean App Platform service. It does not authorize a deployment
or change the existing service. Step 1 packaging and step 2 local safeguards,
load, and fault-injection checks are verified. Production monitoring,
App Platform health settings, and target-host checks remain pending. The local
verification image is dirty and `publishable:false`, and correctly fails
preflight.

## Target and constraints

The target recorded for this work is the existing `urchin-app` service's
`app-imli-server` component: one container, 512 MiB memory, and one shared vCPU.
Do not add components, instances, memory, or other paid resources as part of
this runbook.
The existing `master` auto-deploy setting is on. The normal service remains on
port 4000; `/health` continues to mean Imli's existing health response.

SQLite and temporary media are on the single instance's ephemeral filesystem.
A restart can invalidate active editor sessions and temporary server clips;
saved phone clips are unaffected. Do not mount or restore a SQLite file from an
older image into a new image without checking schema compatibility. This
deployment does not include Mongo migrations. App Platform rollback restores
code, configuration, and the app spec, but does not reverse database data.

The shared readiness check withdraws all component traffic if Imli, the
Soundboard API, the worker IPC heartbeat, or the editor token is unavailable.
This protects a single combined image from serving while one required process
is unhealthy, but it can reduce Imli availability when only the editor/worker
path is impaired. A future deployment decision may instead use Imli-only
readiness and alert separately on editor health; make that tradeoff explicitly
before changing the probe.

## Local artifact gate

Build from a reviewed clean Soundboard commit using the [release builder](../release/README.md).
The `--allow-dirty` option is only for local investigation and marks the image
non-publishable. Run the local preflight and fixture/load harness before any
future authorized push:

```powershell
node .\deploy\shared-imli\ops\preflight.mjs --image soundboard-imli:<local-tag>
.\deploy\shared-imli\test\run.ps1 -ReleaseImage soundboard-imli:<local-tag> -Safeguards -SoakSeconds 300 -FaultChecks
```

The preflight must pass every check. It does not contact a registry or read
credentials. After a separately authorized private-registry push, record and
deploy the immutable registry digest, not a moving tag. Retain the known-healthy
Imli deployment ID and download the complete current App Spec to a private
location before preparing a change. Keep screenshots or exports private and
remove secrets before attaching them to an issue or public repository.

## App Platform health settings

DigitalOcean App Platform health checks are readiness checks: an unhealthy
component stops receiving traffic. A liveness check can restart the component.
If `http_path` is omitted, the platform uses TCP instead of HTTP. The proposed
values below apply only to the existing `app-imli-server` component on port
4000. Merge them into the exported, complete current App Spec; do not upload
this excerpt as a standalone spec.

```yaml
http_port: 4000
health_check:
  initial_delay_seconds: 60
  period_seconds: 15
  timeout_seconds: 3
  success_threshold: 1
  failure_threshold: 3
  http_path: /__shared/ready
  port: 4000
liveness_health_check:
  initial_delay_seconds: 60
  period_seconds: 15
  timeout_seconds: 3
  success_threshold: 1
  failure_threshold: 6
  http_path: /__shared/live
  port: 4000
```

`/__shared/live` should only report whether the gateway event loop can answer;
it must not fail merely because the editor worker is unhealthy. `/__shared/ready`
checks Imli HTTP health, API health including SQLite, a fresh worker IPC
heartbeat, and editor token configuration. Both routes are unauthenticated and
expose only boolean status checks. `HEAD` and `GET` should work. `GET /health`
remains unchanged.
The proposed liveness threshold is deliberately slower than readiness so a
worker/editor failure does not restart otherwise healthy Imli. A worker
heartbeat older than five seconds is stale; a stopped supervisor event loop
should fail liveness.

Do not apply health settings until the main agent confirms the image behavior
and target configuration. App Spec updates define the full app, so preserve all
unrelated resources, environment references, routes, and secrets from the
downloaded current spec.

## Rollout and observation

Before a future rollout, confirm the local gate passed, the private image digest
and source revisions are recorded, the current deployment ID and full spec are
saved privately, and no schema or Mongo migration is included. Apply only the
health settings above to the existing component after review and explicit
authorization.

After the deployment becomes live, verify `/health` and
`/__shared/ready`, run read-only Imli health and GraphQL checks, open the editor
preview, and complete one real render. Watch deployment events/logs, memory,
restart count, and readiness for at least the five-minute soak window. Stop and
roll back if Imli errors, OOM, or repeated unhealthy status appears. Keep the
component at one instance, 512 MiB, and one shared vCPU while investigating.
The local Docker harness's one-CPU quota does not simulate production contention
for a shared vCPU.

Use the existing App Platform deployment-failure alert and high-memory
monitoring if already configured. A manual external `/__shared/ready` monitor
may alert on sustained 503 responses. This runbook creates no automation,
external monitor, or new paid resource.

## Rollback

Use the App Platform Activity view to roll back to the recorded known-healthy
deployment. DigitalOcean permits rollback to one of the ten most recent
successful deployments, provided region, database resources, and configuration
match. Rollback restores code, configuration, and app spec, not database data.
Review the rollback diff before confirming. If automatic deploys could replace
the rollback during investigation, disable auto-deploy in the rollback dialog
only with explicit authorization; re-enable it after the cause is resolved.

After rollback, check Imli `/health` and existing Imli read-only operations.
Check the editor/worker path only if the selected rollback image contains those
endpoints; an earlier Imli-only image may not expose them. Do not restore a
SQLite file blindly across image versions. If an actual data migration was
introduced later, use its separately reviewed backup/restore plan; rollback
alone is not a database recovery plan.

## References

- [DigitalOcean App Platform health checks](https://docs.digitalocean.com/products/app-platform/how-to/manage-health-checks/) — readiness stops traffic; liveness can restart; omitted `http_path` uses TCP.
- [DigitalOcean App Platform deployments and rollback](https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/) — rollback scope, eligible deployments, region/database requirements, and auto-deploy option.
- [DigitalOcean App Spec reference](https://docs.digitalocean.com/products/app-platform/reference/app-spec/) — health check fields and bounds.
