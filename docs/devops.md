# Devops

Pressly currently uses GitHub Actions for verification and a low-cost AWS
Lightsail server for production runtime.

The repository's production topology is:

```txt
GitHub
  -> CI verifies commits
  -> successful main CI publishes one four-image manifest
  -> deploy workflow SSHes into Lightsail
  -> Lightsail pulls immutable API, Web, Worker, and Processor images
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
auth integration tests with Postgres
pricing integration tests with Postgres
LPMS Worker lease integration tests
LPMS composed happy-path proof
web Docker build
API Docker build
Worker Docker build
Processor Docker build
```

Branch Docker jobs use `push: false`. A push to `main` instead runs one
`production-artifacts` job after quality and integration tests pass.

The main release job:

1. Builds each application image once with the same `GITHUB_SHA` revision
   label.
2. Verifies all four labels against the release SHA.
3. Generates one SPDX JSON SBOM per image.
4. Blocks critical OS or library vulnerabilities in every image.
5. Pushes all four SHA-tagged images only after every scan passes.
6. Resolves the registry digests and verifies each published digest still
   carries the same release SHA.
7. Creates one strict release manifest.
8. Uploads the manifest and four SBOMs as `production-release` for 90 days.

The release manifest contains exactly:

```txt
sourceSha
apiImage
webImage
workerImage
processorImage
builtAt
```

Every image value is a digest-qualified GHCR reference. The validator rejects
missing, mutable, duplicate, cross-wired, or extra application images and can
bind validation to an expected full source SHA.

The main image job uses the scoped `GITHUB_TOKEN` to publish to GHCR and a
public browser telemetry DSN at build time when configured. Database, auth,
Cents HMAC, SSH, and other runtime secrets must never enter image builds.

The integration database is a GitHub Actions Postgres service. It is separate
from local Docker and production Docker.

Repository tests prove workflow structure and manifest validation offline. A
successful main-branch run is still required to prove GitHub runner, action,
GHCR push, registry-digest resolution, SBOM generation, and vulnerability-scan
behavior end to end.

## Production Deploy

`.github/workflows/deploy-production.yml` runs after successful main CI or by a
privileged manual selection of a full main-branch commit with successful CI.

It checks out the verified target release on the runner, hashes that release's
deploy script, stages it in a random mode-700 directory on Lightsail, verifies
the transferred hash, and executes that staged script. This matters on the
first four-image cutover: invoking the script from the old host checkout would
continue running the old two-image deployment logic even after Git checks out
the new commit.

For a non-mutating host check, the same target script supports:

```txt
DEPLOY_SHA=<full-sha> \
PRESSLY_API_IMAGE=<digest-reference> \
PRESSLY_WEB_IMAGE=<digest-reference> \
PRESSLY_WORKER_IMAGE=<digest-reference> \
PRESSLY_PROCESSOR_IMAGE=<digest-reference> \
  ./infra/aws/lightsail/deploy.sh --preflight-only
```

That mode validates prerequisites, every required mode-600 runtime env file
including `backup.env`, immutable release identity, the locally available
commit, and rendered Compose configuration. It performs no checkout, pull,
migration, service mutation, or release-metadata rotation.

The deploy script:

```txt
validates the source SHA and four immutable image digests
snapshots the immediately active release before changing deployment state
checks out the selected commit without building application images
pulls the API, Web, Worker, and Processor release set
runs migrations
starts services
checks private API, Web, Processor, and Worker health
polls public API, Web, and Processor readiness with bounded retries
records current release metadata only after public readiness passes
```

Host release metadata is discriminated. Normal current and rollback records use
`four-image-v1` and require all four distinct digest-qualified images from one
full source SHA. Before checkout, migration, or Compose mutation, deploy writes
the validated current record atomically as the rollback target. A failed
upgrade therefore rolls back to the release that was active immediately before
that attempt.

For the first four-image cutover only, deploy can normalize the exact legacy
API/Web metadata produced by the old host script into a marked
`legacy-two-image-v1` rollback record. Rollback may use that marked record to
check out the old two-image Compose and run it with `--remove-orphans`. It does
not accept an unmarked, arbitrary, or mixed partial manifest. Subsequent
rollbacks require complete four-image metadata.

This mechanism proves release selection, not historical compatibility.
Migrations are forward-only, and H3 must prove that the intended previous
binary remains compatible with the migrated production database before the
cutover is approved.

Production runtime values live in mode-600 service-specific files on the
server, not in GitHub:

```txt
/opt/pressly/env/{compose,caddy,web,api,worker,processor,postgres,migration,backup}.env
```

GitHub should only need the SSH deploy credentials:

```txt
LIGHTSAIL_HOST
LIGHTSAIL_USER
LIGHTSAIL_SSH_KEY
```

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
any Worker port
```

Postgres is private inside the Docker network.

The LPMS target also keeps Worker private and routes Processor through Caddy:

```txt
processor hostname /*     -> processor:80
processor hostname /api/* -> api:4000 with /api stripped
```

Processor therefore uses same-origin cookie authentication. API container
ports, Processor container ports, Worker, Postgres, and internal service
traffic are not published on the host.

Use a 4 GB Lightsail instance as the pilot floor unless offline container
measurements prove the existing instance has safe headroom.

The API connects to it with:

```txt
postgres://pressly_runtime:<password>@postgres:5432/pressly
```

## Local Docker

Local Docker still uses the root `docker-compose.yml`.

`pnpm docker:up` builds and starts the complete local application stack:

- Postgres
- API
- Web
- LPMS worker
- LPMS processor

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

Useful commands:

```bash
pnpm docker:up
pnpm docker:down
pnpm docker:web:build
pnpm docker:web:run
pnpm docker:api:up
pnpm docker:test-db:up
pnpm test:int
```

Local Docker is for development and integration testing.

Production Docker is composed by the Lightsail files under `infra/aws/lightsail`.

## Backups

Production Postgres data lives in a Docker volume on the Lightsail server.

That is acceptable only because backups leave the box.

Required production backup path:

```txt
nightly encrypted pg_dump
upload to S3 or Lightsail object storage
retain recent backups
test restore manually
```

The backup script is:

```txt
infra/aws/lightsail/backup-postgres.sh
```

Lightsail snapshots are useful, but they do not replace database dumps.

## Invariant

GitHub verifies source.

Lightsail runs production.

Caddy is the only public runtime entrypoint.

Postgres stays private.

Secrets stay on the server.

Backups leave the server.
