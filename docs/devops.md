# Devops

Pressly currently uses GitHub Actions for verification and a low-cost AWS
Lightsail server for production runtime.

The repository's production topology is:

```txt
GitHub
  -> CI verifies commits
  -> successful main CI publishes one five-image manifest
  -> deploy workflow SSHes into Lightsail
  -> Lightsail pulls immutable API, Web, Worker, Processor, and Control images
  -> Compose runs them with Caddy and Postgres on one private network
```

The release path builds images once in main-branch CI, scans them, records their
registry digests and one source SHA in a manifest, then makes Lightsail pull
those exact digests. Branch CI remains build-only and never publishes a
production release.

## Branch Model

Normal development:

```txt
feature branch
  -> CI
  -> merge to main when ready
  -> successful main CI produces deployable artifacts
  -> production deploy selects that verified main commit
```

During deployment work, branches like `devops-improve` should still run CI.

CI intentionally runs on every branch push and every pull request.

## CI

`.github/workflows/ci.yml` proves that a commit is releasable.

It runs:

```txt
format check
lint
typecheck
unit tests
build
database privilege integration tests with Postgres
auth integration tests with Postgres
users integration tests with Postgres
orders integration tests with Postgres
pricing integration tests with Postgres
webhook-ingestion lease integration tests
LPMS production repository integration tests
API integration tests
LPMS composed happy-path proof
browser smoke tests for Processor and Control
web Docker build
API Docker build
Worker Docker build
Processor Docker build
Control Docker build
```

Branch Docker jobs use `push: false`. A push to `main` instead runs one
`production-artifacts` job after quality and integration tests pass.

The main release job:

1. Builds each application image once with the same `GITHUB_SHA` revision
   label.
2. Verifies all five labels against the release SHA.
3. Generates one SPDX JSON SBOM per image.
4. Blocks critical OS or library vulnerabilities in every image.
5. Pushes all five SHA-tagged images only after every scan passes.
6. Resolves the registry digests and verifies each published digest still
   carries the same release SHA.
7. Creates one strict release manifest.
8. Uploads the manifest and five SBOMs as `production-release` for 90 days.

The release manifest contains exactly:

```txt
sourceSha
apiImage
webImage
workerImage
processorImage
controlImage
builtAt
```

Every image value is a digest-qualified GHCR reference. The validator rejects
missing, mutable, duplicate, cross-wired, or extra application images and can
bind validation to an expected full source SHA.

The main image job uses the scoped `GITHUB_TOKEN` to publish to GHCR and public
browser telemetry DSNs at build time when configured. Processor and Control
source-map uploads receive the project-scoped Sentry token through a BuildKit
secret; the token is not a build argument or image value. Database, auth,
Cents HMAC, SSH, and other runtime secrets must never enter image builds.

The integration database is a GitHub Actions Postgres service. It is separate
from local Docker and production Docker.

The run-centered LPMS migration, API, Worker, and Processor are one coordinated
runtime unit. The contracts intentionally separate Compute, Accept, and Start
and replace shift-derived board lookup with explicit run IDs, so deploying any
one of those surfaces alone is unsupported. The production release also pins
Web and Control to the same source SHA. CI must prove the forward migration,
the signed synthetic Cents path, run-centered API/Processor tests, browser
smoke, and all five application images before that release is eligible for
deployment.

Repository tests prove workflow structure and manifest validation offline. A
successful main-branch run is still required to prove GitHub runner, action,
GHCR push, registry-digest resolution, SBOM generation, and vulnerability-scan
behavior end to end.

## Production Deploy

`.github/workflows/deploy-production.yml` runs after successful main CI or by a
privileged manual selection of a full main-branch commit with successful CI.

It retains the workflow-owned deployment and telemetry tooling at the runner
root, checks out the verified target release under `release-source`, hashes
that release's deploy script, stages it in a random mode-700 directory on
Lightsail, verifies the transferred hash, and executes that staged script. The
separate checkout means an older manually selected release cannot remove or
replace the terminal telemetry helper. The historical first four-image cutover
established the other half of this rule: invoking the script from an old host
checkout could continue running old deployment logic even after Git checks out
the new commit.

Immediately after the first checkout, the repository-owned deployment monitor
validates the event type and exact `workflow_run.head_sha` or manual full SHA,
then sends a Sentry `in_progress` check-in. This precedes manual-CI lookup,
artifact download, manifest validation, SSH configuration, and host mutation.
An `always()` step sends the matching terminal check-in with `ok` for success
and `error` for failure or cancellation. Ordinary cancellation reaches the
terminal step; force-cancellation, runner loss, and failure before the first
checkout cannot guarantee it. The Sentry monitor's runtime timeout covers a
missing terminal check-in once start delivery succeeded.

The helper uses Node's built-in HTTPS transport and the version-7 Sentry
envelope contract; no package installation or Sentry auth token is required.
It sends only check-in identity, fixed slug, status, exact release SHA,
`production`, duration, and timestamps. It has a five-second timeout, rejects
redirects and malformed inputs before sending, never reads a response body,
and prints no DSN, response, log, payload, or customer value. Both telemetry
steps are best-effort and cannot replace the GitHub job status or the bounded
deployment result event.

Configure the GitHub `production` environment with:

```txt
secret:   SENTRY_DEPLOYMENT_DSN=<pressly-api project DSN>
variable: SENTRY_DEPLOYMENT_MONITOR_SLUG=pressly-production-deployment
```

This is the ingest-only project DSN, not `SENTRY_AUTH_TOKEN`. In Sentry's
`pressly-api` project, create the monitor before enabling the workflow:

```txt
name: Production deployment
slug: pressly-production-deployment
environment: production
schedule: interval, 1 year
check-in margin: 40320 minutes
maximum runtime: 30 minutes
failure issue threshold: 1
recovery threshold: 1
timezone: UTC
owner: operator team
```

Sentry Crons requires a recurring schedule even though deployment is
event-driven. The one-year interval and maximum 28-day margin avoid routine
missed-check-in noise while retaining immediate explicit failures and a
30-minute incomplete-run timeout. Route this monitor's production issue to the
operator destination, then prove one synthetic non-PII failure and recovery.
Until the secret, variable, monitor, ownership, route, and notification test are
read back, H2D remains open.

For a non-mutating host check, the same target script supports:

```txt
DEPLOY_SHA=<full-sha> \
PRESSLY_EXPECTED_PUBLIC_IP=<Lightsail-static-IPv4> \
PRESSLY_API_IMAGE=<digest-reference> \
PRESSLY_WEB_IMAGE=<digest-reference> \
PRESSLY_WORKER_IMAGE=<digest-reference> \
PRESSLY_PROCESSOR_IMAGE=<digest-reference> \
PRESSLY_CONTROL_IMAGE=<digest-reference> \
  ./infra/aws/lightsail/deploy.sh --preflight-only
```

That mode validates prerequisites, public DNS against the expected static IPv4
address, every required mode-600 runtime env file including `backup.env`,
immutable release identity, the locally available commit, and rendered Compose
configuration. It performs no checkout, pull, migration, service mutation, or
release-metadata rotation.

The deploy script:

```txt
validates the source SHA and five immutable image digests
records the exact attempted release and preflights public DNS
snapshots the immediately active release before checkout or runtime mutation
checks out the selected commit without building application images
pulls the API, Web, Worker, Processor, and Control release set
runs migrations
starts services
checks private API, Web, Processor, Control, and Worker health
polls public API, Web, Processor, and Control readiness with bounded retries
records current release metadata only after public readiness passes
```

An unverified runtime records every applicable digest and blocks a different
target. `--resume-unverified` accepts only that exact identity. The JSON release
record is authoritative; the plain SHA pointer is derived and replaced first so
an interruption cannot falsely declare a new release active.

Host release metadata is discriminated. Normal current and rollback records use
`five-image-v1` and require all five distinct digest-qualified images from one
full source SHA. Before checkout, migration, or Compose mutation, deploy writes
the validated current record atomically as the rollback target. A failed
upgrade therefore rolls back to the release that was active immediately before
that attempt.

Rollback retains explicit compatibility with complete pre-Control
`four-image-v1` records and restores them without inventing a Control image.
For the historical first four-image cutover only, deploy can also normalize the
exact API/Web metadata produced by the old host script into a marked
`legacy-two-image-v1` rollback record. Rollback may use that marked record to
check out the old two-image Compose and run it with `--remove-orphans`. It does
not accept an unmarked, arbitrary, or mixed partial manifest. New deployments
write only complete `five-image-v1` metadata.

This mechanism proves release selection, not historical compatibility.
Migrations are forward-only, and H3 must prove that the intended previous
binary remains compatible with the migrated production database before the
cutover is approved.

Live production runtime values stay in mode-600 service-specific files on the
server, never in Git or GitHub. The approved encrypted Bitwarden recovery
collection holds the separately controlled off-host recovery copy of required
non-regenerable values and access-recovery artifacts:

```txt
/opt/pressly/env/{compose,caddy,web,api,worker,processor,control,postgres,migration,backup}.env
```

`api.env` must include a dedicated 32-byte base64
`CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY` and may set
`CENTS_WEBHOOK_QUARANTINE_RETENTION_DAYS` (default `30`, maximum `90`). Generate
the key with `openssl rand -base64 32`; do not reuse
`AUTH_MFA_ENCRYPTION_KEY`. A release that includes the quarantine schema will
fail API startup in production until this value is present.

The main-only GitHub `production` environment owns the deploy workflow's SSH
boundary credentials and write-only deployment check-in destination:

```txt
LIGHTSAIL_HOST
LIGHTSAIL_USER
LIGHTSAIL_SSH_KEY
LIGHTSAIL_SSH_KNOWN_HOSTS
SENTRY_DEPLOYMENT_DSN
SENTRY_DEPLOYMENT_MONITOR_SLUG (environment variable)
```

The separate main-only `release-production` environment owns Web, Processor,
and Control Sentry DSNs, the source-map upload token, Sentry project
coordinates, and trace sample rates. Production image builds fail closed when
a required telemetry value is missing. Keeping release credentials separate
prevents image builds from receiving deployment SSH access.

## Runtime

The production Compose stack lives in:

```txt
infra/aws/lightsail/docker-compose.production.yml
```

Public traffic should only reach Caddy:

```txt
80/tcp
443/tcp
22/tcp rate-limited for the current GitHub-hosted deploy runner
```

SSH is key-only, root-disabled, limited to the deployment user, and pinned by
host key in GitHub. An explicit workstation allow can coexist with the
rate-limited rule. Move deployment SSH behind static egress or a private
channel when one is available.

Do not expose:

```txt
5432/tcp
4000/tcp
3000/tcp
Processor container port 80
Control container port 80
any Worker port
```

Postgres is private inside the Docker network.

The application target also keeps Worker private and routes Processor and
Control through Caddy:

```txt
processor hostname /*     -> processor:80
processor hostname /api/* -> api:4000 with /api stripped
control hostname /*       -> control:80
control hostname /api/*   -> api:4000 with /api stripped
```

Processor and Control therefore use separate same-origin cookie boundaries.
API container ports, browser-app container ports, Worker, Postgres, and
internal service traffic are not published on the host.

Use a 4 GB Lightsail instance as the pilot floor unless offline container
measurements prove the existing instance has safe headroom.

The API connects to it with:

```txt
postgres://pressly_runtime:<password>@postgres:5432/pressly
```

## Observability

Control, Processor, API, and Worker report the same validated Git SHA as their
Sentry release. CI compiles Control and Processor browser telemetry and uploads
source maps with a BuildKit secret; deploy injects that SHA into the API and
Worker runtime without editing host env files. Production API metrics require
`FEATURE_METRICS_ENABLED=true`; production Compose enforces that and Sentry for
API and Worker.

The current signals, required dashboards and alerts, privacy boundary, and
floor incident procedure are maintained in [Observability](./observability.md).
Sentry notification routes are still an operator-owned production setup step
and must be exercised in staging before the pilot.

## Local Docker

Local Docker still uses the root `docker-compose.yml`.

`pnpm docker:up` builds and starts the complete local application stack in the
background, waits for its health gates, and then returns control to the shell:

- Postgres
- API
- Web
- LPMS worker
- LPMS processor
- Pressly Control

The API startup also applies the idempotent local topology fixture at
`tooling/fixtures/pressly-one.production-bootstrap.json`. It creates the active
`Pressly One` location, its known 22-washer and 22-dryer capacity, four fixed
pulse stages, and the synthetic `tooling-store-001` Cents binding. It creates no
orders. Repeated startup replays the same bootstrap command instead of mutating
the topology again.

This fixture is local-development configuration only. Production still uses an
operator-reviewed manifest outside the repository as described in the launch
runbook.

The worker runs as its own long-lived container. It depends on Postgres, not on
the API process, so HTTP availability and background processing have independent
failure and restart boundaries.

In WSL, the startup command fails before touching Compose unless it sees the
native WSL Docker daemon through the `default` context, with the daemon data at
`/var/lib/docker`. This prevents silently switching between Docker Desktop and
native WSL volumes. Use `pnpm docker:logs` when attached logs are useful; closing
that log stream does not stop the application. `pnpm docker:down` is the
deliberate command that stops the stack.

Useful commands:

```bash
pnpm docker:up
pnpm docker:logs
pnpm docker:down
pnpm docker:web:build
pnpm docker:web:run
pnpm docker:api:up
pnpm docker:test-db:up
pnpm test:lpms:int
pnpm test:lpms:e2e
pnpm docker:lpms:build
pnpm test:int
```

The LPMS proof uses only synthetic demand. It covers demand projection,
priority intake, automatic placement into the existing run, explicit
membership freeze, all four pulse stages, and completion. It must also prove
that accepted-plan and active-run navigation survive refresh. No production
Cents key, customer payload, or production connection string belongs in this
proof.

Use [Local LPMS Production-Run Simulation](./runbooks/lpms-local-production-run.md)
for the manual 15-order floor workflow and
[Cents Webhook Local Proof](./runbooks/cents-webhook.md) for the focused ingress
authentication cases.

Local Docker is for development and integration testing.

Production Docker is composed by the Lightsail files under `infra/aws/lightsail`.

## Host Maintenance

Use this pilot cadence for the production Lightsail host:

- Review instance status, CPU, burst capacity, disk, memory, automatic snapshot,
  and public health once a week.
- Apply critical Ubuntu, OpenSSH, kernel, and Docker security updates within 72
  hours. Use one scheduled maintenance window each month for all other updates
  and a reboot when `/var/run/reboot-required` exists.
- Before mutation, require a recent available instance snapshot, record the
  current release SHA, and confirm all four public health endpoints return 200.
- After reboot, require Docker Compose health plus Web, API, Processor, and
  Control public health before closing the window.

Use `df -h / /var/lib/docker`, `free -h`, `docker system df`,
`docker stats --no-stream`, and `timedatectl status` for the weekly host review.
Remove old Docker data only after confirming that current and previous release
digests are recorded and still pullable from GHCR. Do not delete the rollback
host or its retained snapshot until database restore evidence meets the agreed
recovery window.

Production also runs `pressly-host-capacity` through Sentry every five minutes.
It becomes unhealthy when disk usage reaches 80 percent or available memory is
below 512 MiB for three consecutive checks. This is an early operational alarm,
not a replacement for the weekly host review or the monthly patch window. The
host enforces non-overlap and a one-minute process timeout independently of
Sentry's check-in timeout.

## Backups

Production Postgres data lives in a Docker volume on the Lightsail server.

That is acceptable only because backups leave the box.

Required production backup path:

```txt
hourly encrypted pg_dump at :15 UTC
upload the same triplet to the primary and independent S3 secondary
retain secondary versions for 90 days in Object Lock COMPLIANCE mode
verify readback every run and prove replacement-host restore separately
```

The backup script is:

```txt
infra/aws/lightsail/backup-postgres.sh
```

The hourly production recipe wraps this script with the
`pressly-postgres-backup` Sentry Cron monitor. A successful check-in therefore
means the encrypted dump, checksum, and metadata were uploaded and the remote
encrypted bytes passed the script's readback checksum. A missing, timed-out, or
failed execution reaches the existing production issue-alert destination.
The host independently prevents overlapping backups and terminates one after
25 minutes, leaving five minutes for Sentry to report failure before its
30-minute check-in timeout. Production cron requires the host timezone to stay
`Etc/UTC` and declares a fixed system path that includes `/usr/local/bin`.

Steven approved a one-hour RPO, four-hour RTO, and 90-day Object Lock
`COMPLIANCE` target. Dated 2026-08-09 evidence proves the deployed hourly
dual-destination schedule, natural successful executions, and exact retention
on the three inspected versions of one secondary triplet. This is schedule and
custody evidence, not a completed recovery drill: the achieved RPO and RTO stay
open until a disposable replacement host restores the latest complete immutable
triplet available at drill start. Before that drill, separately prove
recoverable non-root AWS management access, GoDaddy authoritative-DNS access
with MFA, and the Pressly Production Owner password plus ordinary TOTP/recovery
path; then refresh and reverify the post-merge exact release in Bitwarden escrow.

Lightsail snapshots are useful, but they do not replace database dumps.

## Invariant

GitHub verifies source.

Lightsail runs production.

Caddy is the only public runtime entrypoint.

Postgres stays private.

Live runtime secrets stay on the server and out of Git and GitHub; required
non-regenerable recovery material has a separately controlled encrypted
off-host Bitwarden copy.

Backups leave the server.
