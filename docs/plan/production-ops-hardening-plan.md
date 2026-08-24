# Production Ops Hardening Plan

This plan is for the last minimum production safety layer before going back to product work.

The current production shape is:

```txt
GitHub Actions
  -> SSH into Lightsail
  -> /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
  -> Docker Compose
    -> caddy
    -> web
    -> api
    -> postgres
```

The goal is not full platform engineering.

The goal is:

```txt
bad deploys can be rolled back
bad migrations are handled intentionally
backups are proven restorable
basic outages notify you
logs cannot casually fill the server disk
```

## 1. Scope

Do these now:

1. Add code rollback by git ref.
2. Add production migration safety rules.
3. Practice one backup restore.
4. Add Sentry uptime alerts to Slack.
5. Add Docker log rotation.

Do not do these yet:

1. Blue/green deploys.
2. Canary deploys.
3. ECS/RDS migration.
4. Full tracing strategy.
5. Slack notifications for every 4xx.
6. Incident process docs beyond the small runbook you will write later.

## 2. Release And Rollback

### Problem

`deploy.sh` currently deploys a branch, usually `main`.

That is enough for normal deploys, but rollback should target an exact known-good git commit.

Branch rollback is too vague because the branch can move.

### Target Behavior

Support this:

```bash
DEPLOY_REF=main /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
DEPLOY_REF=<git-sha> /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
DEPLOY_REF=<tag> /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
```

Keep this working for compatibility:

```bash
DEPLOY_BRANCH=main /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
```

The script should write:

```txt
/opt/pressly/current-release
/opt/pressly/previous-release
```

Each file should contain a git SHA.

### Files To Change

Change:

```txt
deploy/aws/lightsail/deploy.sh
.github/workflows/deploy-production.yml
deploy/aws/lightsail/README.md
deploy/aws/lightsail/.env.production.example
```

Add:

```txt
deploy/aws/lightsail/rollback.sh
```

### Step 1: Add DEPLOY_REF To deploy.sh

In `deploy.sh`, replace the single branch concept with a deploy ref:

```bash
DEPLOY_REF="${DEPLOY_REF:-${DEPLOY_BRANCH:-main}}"
```

Validate it with the same conservative character rule:

```bash
case "$DEPLOY_REF" in
  -* | *[!a-zA-Z0-9._/-]*)
    echo "Invalid deploy ref: $DEPLOY_REF" >&2
    exit 1
    ;;
esac
```

Fetch branches and tags:

```bash
git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
```

Resolve branches through `origin` and everything else as a direct git ref:

```bash
if git show-ref --verify --quiet "refs/remotes/origin/$DEPLOY_REF"; then
  git checkout -B "$DEPLOY_REF" "origin/$DEPLOY_REF"
else
  git checkout --detach "$DEPLOY_REF"
fi

target_sha="$(git rev-parse --verify HEAD)"
```

Use `target_sha` as the release identity.

### Step 2: Record Current And Previous Release

Add these paths:

```bash
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"
```

Read the currently deployed release before doing the deployment:

```bash
previous_sha=""

if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  previous_sha="$(cat "$CURRENT_RELEASE_FILE")"
fi
```

Only after build, migration, `up --wait`, `ps`, and health checks succeed, write:

```bash
if [[ -n "$previous_sha" && "$previous_sha" != "$target_sha" ]]; then
  printf '%s\n' "$previous_sha" > "$PREVIOUS_RELEASE_FILE"
fi

printf '%s\n' "$target_sha" > "$CURRENT_RELEASE_FILE"
```

This means a failed deploy does not mark itself as current.

### Step 3: Add rollback.sh

Create `deploy/aws/lightsail/rollback.sh`.

Shape:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"
DEPLOY_SCRIPT="${PRESSLY_DEPLOY_SCRIPT:-$APP_ROOT/repo/deploy/aws/lightsail/deploy.sh}"

if [[ ! -f "$PREVIOUS_RELEASE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

previous_sha="$(cat "$PREVIOUS_RELEASE_FILE")"

case "$previous_sha" in
  "" | *[!a-fA-F0-9]*)
    echo "Invalid previous release SHA: $previous_sha" >&2
    exit 1
    ;;
esac

DEPLOY_REF="$previous_sha" "$DEPLOY_SCRIPT"
```

Make it executable:

```bash
chmod +x deploy/aws/lightsail/rollback.sh
```

### Step 4: Update GitHub Actions

In `.github/workflows/deploy-production.yml`, rename the manual input from branch-only language to ref language.

Use:

```yaml
inputs:
  ref:
    description: Branch, tag, or git SHA to deploy
    required: true
    default: main
```

For automatic deploys after CI, keep deploying the workflow run branch.

For manual deploys, use the input ref.

Send `DEPLOY_REF` over SSH:

```bash
ssh \
  -i ~/.ssh/lightsail \
  -o IdentitiesOnly=yes \
  "$LIGHTSAIL_USER@$LIGHTSAIL_HOST" \
  "DEPLOY_REF='$DEPLOY_REF' /opt/pressly/repo/deploy/aws/lightsail/deploy.sh"
```

### Step 5: Update Docs And Env Example

Add optional env docs:

```bash
# Deployment script overrides.
# DEPLOY_REF=main
# PRESSLY_CURRENT_RELEASE_FILE=/opt/pressly/current-release
# PRESSLY_PREVIOUS_RELEASE_FILE=/opt/pressly/previous-release
```

Add manual rollback command to `deploy/aws/lightsail/README.md`:

```bash
/opt/pressly/repo/deploy/aws/lightsail/rollback.sh
```

Also document exact rollback by SHA:

```bash
DEPLOY_REF=<known-good-sha> /opt/pressly/repo/deploy/aws/lightsail/deploy.sh
```

### Verification

Run locally:

```bash
pnpm format:check
pnpm lint
```

After deploying to the server:

```bash
cat /opt/pressly/current-release
cat /opt/pressly/previous-release
curl -f https://api.trypressly.com/health/ready
curl -f https://trypressly.com/health
```

Rollback test:

```bash
ssh ubuntu@18.232.228.111
/opt/pressly/repo/deploy/aws/lightsail/rollback.sh
curl -f https://api.trypressly.com/health/ready
curl -f https://trypressly.com/health
```

## 3. Production Migration Safety

### Problem

Code rollback is only safe when the database remains compatible with both the previous code and the new code.

If a deploy drops a column and the new app fails, rolling code back will not restore that column.

### Rule

Normal production migrations must be additive and backward-compatible.

Allowed during normal deploy:

```txt
create table
add nullable column
add column with safe default
create index concurrently when supported
add enum value when backward-compatible
add non-breaking constraint after data is already valid
```

Not allowed during normal deploy:

```txt
drop table
drop column
rename table
rename column
change column type destructively
truncate
delete production data
make nullable column required without a backfill plan
```

Destructive migration rule:

```txt
maintenance window
fresh backup
restore command ready
manual approval
forward-fix plan
```

### Files To Change

Add:

```txt
docs/ops/production-migrations.md
```

Optional later:

```txt
tooling/scripts/check-production-migrations.mjs
```

Do the doc first.

Do not add a noisy migration scanner until the manual rule becomes hard to enforce.

### Step 1: Write docs/ops/production-migrations.md

Include:

1. The allowed list.
2. The disallowed list.
3. The destructive migration checklist.
4. A simple expand-contract example.

Example:

```txt
Bad:
rename column full_name to display_name in one deploy

Good:
deploy 1: add nullable display_name
deploy 2: write both full_name and display_name
deploy 3: backfill display_name
deploy 4: read display_name
later maintenance: drop full_name
```

### Step 2: Link It From The AWS README

In `deploy/aws/lightsail/README.md`, add a short migration warning near deploy instructions:

```txt
Production deploys assume migrations are backward-compatible.
Read docs/ops/production-migrations.md before generating destructive migrations.
```

### Verification

Review the current migration folder:

```bash
rg -n "drop table|drop column|rename column|rename table|truncate|delete from" packages/db/src/migrations
```

Before future production deploys, manually inspect new migration SQL.

## 4. Backup Restore Drill

### Problem

You already have encrypted backups uploading to S3.

That is not enough by itself.

A backup is only trustworthy after one restore works.

### Target Behavior

Practice restoring one production backup into a disposable Postgres target without touching production data.

Do not run the first restore test against the production Postgres volume.

### Files To Change

Update:

```txt
deploy/aws/lightsail/restore-postgres.md
deploy/aws/lightsail/README.md
```

Optional add:

```txt
deploy/aws/lightsail/restore-postgres-drill.md
```

### Step 1: Download A Backup

On the Lightsail server:

```bash
AWS_PROFILE=pressly-backup aws s3 ls s3://bucket-a5tjsz/postgres/

AWS_PROFILE=pressly-backup aws s3 cp \
  s3://bucket-a5tjsz/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  /opt/pressly/backups/postgres/
```

### Step 2: Start A Disposable Restore Database

Use a temporary container that is not the production Compose Postgres service:

```bash
docker run --rm --name pressly-restore-drill-postgres \
  -e POSTGRES_DB=pressly_restore_drill \
  -e POSTGRES_USER=pressly \
  -e POSTGRES_PASSWORD=pressly_restore_drill \
  -d postgres:18-bookworm
```

Wait for readiness:

```bash
docker exec pressly-restore-drill-postgres \
  pg_isready -U pressly -d pressly_restore_drill
```

### Step 3: Restore Into The Disposable Database

```bash
gpg --decrypt \
  --batch \
  --passphrase-file /opt/pressly/backup-passphrase.txt \
  /opt/pressly/backups/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  | gunzip \
  | docker exec -i pressly-restore-drill-postgres \
      psql -U pressly -d pressly_restore_drill -v ON_ERROR_STOP=1
```

### Step 4: Prove Data Exists

Run a few simple table checks.

Example:

```bash
docker exec -i pressly-restore-drill-postgres \
  psql -U pressly -d pressly_restore_drill -c '\dt'

docker exec -i pressly-restore-drill-postgres \
  psql -U pressly -d pressly_restore_drill -c 'select count(*) from auth_identities;'
```

Use real table names from `packages/db/src/schema`.

### Step 5: Clean Up

```bash
docker stop pressly-restore-drill-postgres
```

### Verification

Write the drill result into the future runbook:

```txt
Last restore drill:
- date:
- backup object:
- restored into:
- command passed:
- table checks passed:
```

## 5. Sentry Uptime And Slack

### Problem

GitHub deploy tells you whether a deployment finished.

It does not continuously tell you whether production is reachable after that.

### Recommendation

Use Sentry Uptime Monitoring for now.

Official docs:

```txt
https://docs.sentry.io/product/monitors-and-alerts/monitors/uptime-monitoring/
https://docs.sentry.io/product/monitors-and-alerts/alerts/
https://sentry.io/integrations/slack/
```

Use Sentry for uptime notifications now.

Do API error instrumentation later as part of observability.

The API already has Sentry env config and dependency, but API-side `Sentry.init` is not wired yet.

### Monitors To Create

Create two uptime monitors:

```txt
https://api.trypressly.com/health/ready
https://trypressly.com/health
```

Recommended settings:

```txt
interval: 1 minute or 5 minutes
timeout: 10 seconds
alert after: 2 consecutive failures
recovery after: 1 successful check
notification: Slack production channel
```

Use 5 minutes if you want fewer alerts.

Use 1 minute if you want faster detection.

### Slack Rule

Route only uptime failures to Slack for now.

Do not send every 4xx to Slack.

Later observability rule:

```txt
5xx: alert quickly
4xx: aggregate or alert only on anomaly/security patterns
```

### Repo Changes

No code change is required for uptime checks.

Optional doc update:

```txt
deploy/aws/lightsail/README.md
```

Add the Sentry monitor URLs and Slack channel name after you create them.

### Verification

From your local machine:

```bash
curl -f https://api.trypressly.com/health/ready
curl -f https://trypressly.com/health
```

In Sentry:

```txt
both monitors show healthy
Slack test notification arrives in the production channel
```

## 6. Docker Log Rotation

### Problem

On a single VPS, one boring failure mode is logs filling the disk.

Docker's default JSON logs can grow forever if not configured.

### Target Behavior

Limit container log files globally.

### Server File To Change

On the Lightsail server, create or edit:

```txt
/etc/docker/daemon.json
```

Use:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
```

Restart Docker during a low-traffic window:

```bash
sudo systemctl restart docker
```

Then restart production:

```bash
cd /opt/pressly/repo
docker compose \
  --env-file /opt/pressly/.env.production \
  -f deploy/aws/lightsail/docker-compose.production.yml \
  up -d --wait
```

### Verification

```bash
docker info --format '{{.LoggingDriver}}'
docker inspect pressly-production-api-1 \
  --format '{{json .HostConfig.LogConfig}}'
df -h
curl -f https://api.trypressly.com/health/ready
curl -f https://trypressly.com/health
```

## 7. Final Checklist

This plan is done when:

```txt
deploy by branch works
deploy by SHA works
current-release exists
previous-release exists
rollback.sh works
migration safety doc exists
backup restore drill has passed once
Sentry uptime checks are healthy
Slack receives a test alert
Docker log rotation is configured
production health checks pass
```

Commands:

```bash
cat /opt/pressly/current-release
cat /opt/pressly/previous-release
curl -f https://api.trypressly.com/health/ready
curl -f https://trypressly.com/health
AWS_PROFILE=pressly-backup aws s3 ls s3://bucket-a5tjsz/postgres/
df -h
```

After this, stop expanding DevOps unless production gives you a real reason.
