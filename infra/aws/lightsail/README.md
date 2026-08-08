# Pressly Lightsail Runtime

Production runs Caddy, Web, API, Worker, Processor, Control, and Postgres on one
private Compose network. Only Caddy publishes host ports. CI builds and scans
the five application images; the server pulls immutable GHCR digests and never
rebuilds application source.

## Server Layout

```text
/opt/pressly/
  env/                       service-specific mode-600 files
  repo/                      deployment tooling checkout
  backups/postgres/          short-lived encrypted local copies
  backup-passphrase.txt      mode 600; retain an offline recovery copy
  deployment-state.json     exact attempted or unverified release identity
  current-release.json       active release format, SHA, and image digests
  previous-release.json      immediate rollback release identity
```

## First Setup

1. Install Docker, Git, AWS CLI, GnuPG, and Python 3.
2. Clone the repository to `/opt/pressly/repo`.
3. Copy each `infra/aws/docs/env/*.example` file to `/opt/pressly/env/`
   without `.example`, replace placeholders, then run:

```bash
chmod 600 /opt/pressly/env/*.env
chmod 700 /opt/pressly/env
```

4. Configure the fixed database roles:

```bash
/opt/pressly/repo/infra/aws/lightsail/configure-database-roles.sh
```

5. Authenticate Docker to the private GHCR packages using a read-only package
   credential owned by the deployment operator:

```bash
printf '%s' '<read-only-token>' | docker login ghcr.io -u '<github-user>' --password-stdin
```

6. Generate and protect the backup passphrase:

```bash
openssl rand -base64 48 > /opt/pressly/backup-passphrase.txt
chmod 600 /opt/pressly/backup-passphrase.txt
```

Set `PRESSLY_PROCESSOR_DOMAIN` in `caddy.env`, and create `worker.env` and
`processor.env` from the checked-in examples. The worker env owns the runtime
database URL and Sentry configuration. API and Worker receive the validated
deployment SHA as `SENTRY_RELEASE` from `deploy.sh`; do not maintain that value
manually in their env files. The static Processor env contains no browser
credential or API secret.

Configure release build telemetry in the main-only GitHub environment
`release-production`:

```text
secret NEXT_PUBLIC_SENTRY_DSN
secret PROCESSOR_SENTRY_DSN
secret SENTRY_AUTH_TOKEN       source-map upload only; project-scoped
variable SENTRY_ORG
variable PROCESSOR_SENTRY_PROJECT
variable NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
variable PROCESSOR_SENTRY_TRACES_SAMPLE_RATE
```

Both browser DSNs are public configuration compiled into their JavaScript
bundles. The auth token is mounted only as a BuildKit secret and never enters
an image layer. CI fails before building production images when any required
telemetry value is absent. It compiles the exact Git SHA and `production`
environment into the Processor and removes source maps after uploading them.
See `docs/observability.md` for dashboard, alert, and incident-response setup.

Deployment is driven by `.github/workflows/deploy-production.yml`. The workflow
supplies one exact source SHA and the API, Web, Worker, Processor, and Control
image digests to `deploy.sh`. It stages and verifies `deploy.sh` from that exact
target checkout before execution; it does not trust the deployment logic from
the currently checked-out host release during the first cutover.

The workflow also supplies the verified Lightsail static IPv4 address. Before
any release snapshot, checkout, migration, or Compose mutation, deploy requires
every applicable public hostname to resolve to that address. This catches a
missing or stale GoDaddy record before the database or runtime changes.

Before `deploy.sh` checks out another commit, runs migrations, or changes
Compose, it validates the active release and atomically writes that exact
identity to `previous-release.json`. A failed upgrade therefore keeps the
immediately preceding release as its rollback target instead of an older
N-minus-one release. Successful normal deploys write a `five-image-v1` current
record containing all five immutable digests from one source SHA.

Every mutating attempt also writes a mode-600 `deployment-state.json` with its
phase and complete immutable image identity. If Compose mutation begins but
public verification fails, a different release is refused so it cannot erase
the identity that may still be running. After correcting the external failure,
an operator may rerun only that exact release with `--resume-unverified`; use
rollback and incident reconciliation instead when the intended target changed.
`current-release.json` is authoritative; the plain `current-release` SHA file
is a derived compatibility pointer and is replaced before the authoritative
JSON so an interrupted two-file update cannot falsely declare a release active.

After Compose reports the private services healthy, deploy polls the public
API, Web, Processor, and Control routes with bounded timeouts and retries. This
absorbs the normal TLS-certificate convergence window after Caddy restarts
without declaring an unverified release successful. Current release metadata
is written only after every public route passes.

The first five-image cutover can snapshot and restore a complete
`four-image-v1` release without inventing a Control image. The older first
four-image cutover has one narrower compatibility path. The deploy
preflight recognizes only the exact unmarked two-image metadata written by the
old deploy script, normalizes it to a marked `legacy-two-image-v1` rollback
record, and rejects all other partial shapes. That marker is not a general
two-image deployment option.

## Non-Mutating Deployment Preflight

Run preflight from the reviewed target checkout with the exact release SHA and
five digest-qualified image references:

```bash
DEPLOY_SHA='<40-character-main-commit-sha>' \
PRESSLY_EXPECTED_PUBLIC_IP='<Lightsail-static-IPv4>' \
PRESSLY_API_IMAGE='ghcr.io/<owner>/<api-image>@sha256:<64-hex-digest>' \
PRESSLY_WEB_IMAGE='ghcr.io/<owner>/<web-image>@sha256:<64-hex-digest>' \
PRESSLY_WORKER_IMAGE='ghcr.io/<owner>/<worker-image>@sha256:<64-hex-digest>' \
PRESSLY_PROCESSOR_IMAGE='ghcr.io/<owner>/<processor-image>@sha256:<64-hex-digest>' \
PRESSLY_CONTROL_IMAGE='ghcr.io/<owner>/<control-image>@sha256:<64-hex-digest>' \
  ./infra/aws/lightsail/deploy.sh --preflight-only
```

Preflight validates the full SHA, immutable and distinct image identities,
public DNS against the expected static IPv4 address, current release metadata,
the locally available target commit, deployment prerequisites, every required
mode-600 env file—including `backup.env`—and the rendered production Compose
config. It does not fetch, check out, pull, migrate, start, stop, or recreate
anything, and it does not rewrite current or previous release metadata.

## Production Facility Bootstrap

Keep `/opt/pressly/config/lpms-bootstrap.json` mode 600 and owned by the
deployment operator. Mount only that file into an ephemeral API-image tool
container, first as a dry run and then with the same stable idempotency key for
apply:

The facility can be bootstrapped with `sourceLocationBindings: []` before a
vendor store identifier is confirmed. An empty binding manifest is a
non-destructive no-op: it neither invents a vendor identifier nor removes an
existing binding. Add a real binding in a later reviewed convergence run before
enabling that vendor's delivery.

```bash
bootstrap_file=/opt/pressly/config/lpms-bootstrap.json
actor_id='<authorized-operator-uuid>'
idempotency_key='<stable-reviewed-bootstrap-key>'

test "$(stat -c '%a' "$bootstrap_file")" = 600
sha256sum "$bootstrap_file"

docker compose \
  --profile tools \
  --env-file /opt/pressly/env/compose.env \
  -f /opt/pressly/repo/infra/aws/lightsail/docker-compose.production.yml \
  run --rm -T --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$bootstrap_file:/run/pressly/lpms-bootstrap.json:ro" \
  --workdir /repo \
  --entrypoint node \
  api \
  apps/cli/dist/commands/bootstrap-production.command.js \
  --file /run/pressly/lpms-bootstrap.json \
  --actor-id "$actor_id" \
  --idempotency-key "$idempotency_key" \
  --dry-run

docker compose \
  --profile tools \
  --env-file /opt/pressly/env/compose.env \
  -f /opt/pressly/repo/infra/aws/lightsail/docker-compose.production.yml \
  run --rm -T --no-deps \
  --user "$(id -u):$(id -g)" \
  --volume "$bootstrap_file:/run/pressly/lpms-bootstrap.json:ro" \
  --workdir /repo \
  --entrypoint node \
  api \
  apps/cli/dist/commands/bootstrap-production.command.js \
  --file /run/pressly/lpms-bootstrap.json \
  --actor-id "$actor_id" \
  --idempotency-key "$idempotency_key" \
  --apply
```

Do not print the file contents or place facility configuration in image layers.
Record only the reviewed file hash and the redacted create/update/no-op result.

The processor hostname has two routes:

```text
/*     -> processor:80
/api/* -> api:4000 after stripping /api
```

Worker has no route or exposed port. Its private container healthcheck reads a
heartbeat file that advances only after a successful inbox pass.

## Disposable Offline Topology Proof

Run the production-shape smoke only against a local Unix Docker context:

```bash
pnpm docker:production:smoke
```

The harness refuses remote Docker endpoints, binds only one random high
loopback port, builds all five production Dockerfiles, migrates a unique clean
Postgres volume, and applies an explicit synthetic facility and owner fixture.
It then proves local HTTPS Caddy routes, production cookie and CSRF behavior, a
signed Cents event applied by Worker, independent API and Worker restarts,
and a complete release-A to release-B switch followed by five-image rollback.
Current/previous release metadata exists only in its temporary directory.

Both release identities deliberately reference the same current-tree content
under distinct local tags. This proves Compose and metadata-switch mechanics,
not compatibility between two historical binaries. The emitted `/tmp` report
includes one `docker stats --no-stream` snapshot against the 4 GiB pilot floor;
it is not a production sizing guarantee. The isolated project and volumes are
removed on success, failure, or interruption. The harness never invokes
`deploy.sh`, `rollback.sh`, Git, GitHub, Cents, DNS, or cloud endpoints.

## Quickest Step By Step For Rollback

Rollback reuses the previous immutable image digests. It does not reverse a
destructive migration.

```bash
ssh ubuntu@<server>
/opt/pressly/repo/infra/aws/lightsail/rollback.sh
curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
curl --fail --silent --show-error https://processor.trypressly.com/health
curl --fail --silent --show-error https://control.trypressly.com/health
```

Normal rollback requires one complete `five-image-v1` record with five distinct
immutable image digests and one full source SHA. During the first Control
cutover, rollback also accepts a complete `four-image-v1` record. During only
the older first four-image cutover, it accepts the normalized
`legacy-two-image-v1` record. It checks out that old source SHA, restores its
historical Compose definition, and starts it with `--remove-orphans`, removing
applications that did not exist in that release. Unmarked legacy records,
mixed shapes, and partial release records are rejected.

Database migrations remain forward-only. Offline tests prove metadata
selection and Compose rollback mechanics, but they do not prove that a
historical application binary can run against the migrated production schema.
H3 must verify that exact binary/database pairing with a current backup and the
approved release artifacts before the first cutover. After a transitional
legacy rollback, reattempt the cutover only through the verified main release;
do not hand-edit release metadata.

Use at least a 4 GB Lightsail instance for the LPMS pilot unless an offline
measurement of the complete stack proves a smaller host has safe headroom.
Allow public ports 80 and 443. The current GitHub-hosted deploy runner also
requires rate-limited public SSH because it has no stable egress address; keep
SSH key-only, disable root login, pin the host key in GitHub, and allow only the
deployment user. Replace this with static egress or a private deployment channel
when one is available. Never publish Postgres, API, Processor, Control, or Worker
container ports.

## Backups

Run one verified encrypted S3 backup:

```bash
PRESSLY_BACKUP_S3_URI=s3://<bucket>/postgres \
  /opt/pressly/repo/infra/aws/lightsail/backup-postgres.sh
```

Cron example:

```text
15 3 * * * PRESSLY_BACKUP_S3_URI=s3://<bucket>/postgres /opt/pressly/repo/infra/aws/lightsail/backup-postgres.sh >> /var/log/pressly-backup.log 2>&1
```

The script uploads the encrypted dump, checksum, and metadata, then downloads
the encrypted object stream to verify its SHA-256 checksum.

For a Lightsail object-storage bucket, attach the production instance through
Lightsail resource access instead of retaining a long-lived bucket access key.
Keep the bucket private and enable object versioning. The AWS CLI then resolves
the instance credential automatically; the cron entry does not set
`AWS_PROFILE`.

Resource access gives the attached instance full access to that Lightsail
bucket. Versioning protects recoverability from ordinary overwrite or deletion,
but it is not immutable retention against a compromised host that deletes
specific versions. Before this pilot risk is no longer acceptable, copy backups
into a separate standard S3 security boundary with Object Lock or a writer that
cannot delete versions.

Download Sentry CLI `0.40.0` for Linux x86-64 from the exact release asset
`https://github.com/getsentry/cli/releases/download/0.40.0/sentry-linux-x64.gz`,
decompress it without executing it, and verify the binary SHA-256 is
`1f2f64ec8bb23ced496a103977cb54e72b49b83495cf30c3cad487dcefd70c16`,
then install that verified binary root-owned and mode `0755` at
`/usr/local/bin/sentry`. The monitored operation runner reads only `SENTRY_DSN`
from the mode-600 Worker environment file and never prints it. Replace the plain
backup cron entry with:

```bash
(
set -euo pipefail
PRESSLY_SENTRY_TMP="$(mktemp -d)"
curl --fail --silent --show-error --location \
  https://github.com/getsentry/cli/releases/download/0.40.0/sentry-linux-x64.gz \
  --output "$PRESSLY_SENTRY_TMP/sentry.gz"
gzip --decompress --stdout "$PRESSLY_SENTRY_TMP/sentry.gz" \
  > "$PRESSLY_SENTRY_TMP/sentry"
printf '%s  %s\n' \
  1f2f64ec8bb23ced496a103977cb54e72b49b83495cf30c3cad487dcefd70c16 \
  "$PRESSLY_SENTRY_TMP/sentry" | sha256sum --check --strict
sudo install --owner=root --group=root --mode=0755 \
  "$PRESSLY_SENTRY_TMP/sentry" /usr/local/bin/sentry
unlink "$PRESSLY_SENTRY_TMP/sentry.gz"
unlink "$PRESSLY_SENTRY_TMP/sentry"
rmdir "$PRESSLY_SENTRY_TMP"
unset PRESSLY_SENTRY_TMP
)
```

```text
MAILTO=""
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 3 * * * PRESSLY_BACKUP_S3_URI=s3://<bucket>/postgres /opt/pressly/repo/infra/aws/lightsail/run-monitored-operation.sh backup >/dev/null 2>&1
*/5 * * * * /opt/pressly/repo/infra/aws/lightsail/run-monitored-operation.sh host-capacity >/dev/null 2>&1
```

Ubuntu's default cron does not interpret `CRON_TZ`; require the host timezone
to remain `Etc/UTC` and verify it with
`timedatectl show --property=Timezone --value` before installing the schedule.
`pressly-postgres-backup` reports success only after the remote encrypted bytes
match the local SHA-256. `pressly-host-capacity` fails after disk usage reaches
80 percent or available memory falls below 512 MiB; Sentry opens an issue only
after three consecutive failed checks and resolves it after three healthy
checks. The runner prevents overlapping executions and terminates a backup
after 25 minutes so Sentry can report the failure before its 30-minute maximum
runtime. Run both recipes once manually after installation, then read the
monitors and their successful check-ins back from Sentry; the CLI intentionally
preserves a successful wrapped command exit even when a check-in cannot be sent.

## Processor Clean-Slate Maintenance

`reset-processor-operational-data.sql` removes operational orders, proposals,
shifts, schedules, runs, batches, stage progress, and their order/run events.
It preserves facility configuration, users, source bindings, source-authority
policy, webhook receipts, and quarantine evidence.

This is a maintenance-window procedure, not a migration. Use the destructive
checklist in `docs/ops/production-migrations.md`. Stop API, Worker, and
Processor; create a fresh encrypted backup with `backup-postgres.sh`; verify
the uploaded checksum; and run the SQL only through the migration environment
for the exact deployed release. The SQL requires:

```text
PGOPTIONS=-cpressly.environment=production_processor_reset
reset_id=processor-production-clean-slate-v1
release_sha=<current-release.json sourceSha>
backup_sha256=<verified backup SHA-256>
```

It refuses to run under the runtime role, while any runtime database session
remains, against an inactive or unexpected facility, before the current
order-authority schema exists, or while an inbox event is still claimable.
Restart the stopped services only after the SQL reports zero remaining
operational records and confirms the preserved configuration counts.

## Recovery

```text
bad application release, data is sound -> rollback.sh
data corruption or machine loss        -> restore-postgres.md
practice and evidence                   -> restore-postgres-drill.md
```

Read:

- `infra/aws/docs/restore-postgres-drill.md`
- `infra/aws/docs/restore-postgres.md`
- `docs/security/incident-response.md`
