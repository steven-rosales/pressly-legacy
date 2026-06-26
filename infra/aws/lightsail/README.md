# Pressly Lightsail Deployment

This directory owns the low-cost AWS production setup.

Runtime shape:

```txt
Lightsail VPS
  -> Docker Compose
  -> Caddy on 80/443
  -> web and api on the private Compose network
  -> Postgres on the private Compose network
```

Postgres is intentionally not exposed to the internet.

## Server Layout

```txt
/opt/pressly/
  .env.production
  backup-passphrase.txt
  backups/
  repo/
```

`repo/` is the git checkout of this repository.

Secrets stay outside the repo.

## First Server Setup

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git ufw gpg
```

Install Docker using Docker's official Ubuntu install flow.

Then:

```bash
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/pressly/backups/postgres
sudo chown -R ubuntu:ubuntu /opt/pressly
```

Create the production env file:

```bash
cp /opt/pressly/repo/infra/aws/docs/.env.production.example /opt/pressly/.env.production
nano /opt/pressly/.env.production
chmod 600 /opt/pressly/.env.production
```

Required values:

```txt
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4000
DATABASE_URL=postgres://pressly:<postgres-password>@postgres:5432/pressly
DATABASE_MAX_CONNECTIONS=10
LOG_LEVEL=info
CORS_ORIGIN=https://trypressly.com
AUTH_SECRET=<strong-random-secret>
AUTH_SESSION_TTL_MINUTES=720
AUTH_LOGIN_WINDOW_MINUTES=15
AUTH_LOGIN_MAX_FAILURES=8
AUTH_FRESH_SESSION_MAX_AGE_MINUTES=15
FEATURE_METRICS_ENABLED=false
FEATURE_JOBS_ENABLED=false
SENTRY_ENABLED=false
POSTHOG_ENABLED=false
POSTGRES_DB=pressly
POSTGRES_USER=pressly
POSTGRES_PASSWORD=<postgres-password>
HOSTNAME=0.0.0.0
PORT=3000
API_BASE_URL=https://api.trypressly.com
NEXT_PUBLIC_API_BASE_URL=https://api.trypressly.com
NEXT_PUBLIC_ANALYTICS_ENABLED=false
PRESSLY_WEB_DOMAIN=trypressly.com
PRESSLY_API_DOMAIN=api.trypressly.com
```

Clone the repo:

```bash
git clone git@github.com:<owner>/<repo>.git /opt/pressly/repo
```

## Deploy Manually

```bash
/opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

Deploy another branch:

```bash
DEPLOY_BRANCH=<branch-name> /opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

Production deploys assume migrations are backward-compatible.
Read `docs/ops/production-migrations.md` before generating destructive
migrations.

## Backups

Create a server-only encryption passphrase:

```bash
openssl rand -base64 48 > /opt/pressly/backup-passphrase.txt
chmod 600 /opt/pressly/backup-passphrase.txt
```

Run once:

```bash
PRESSLY_BACKUP_S3_URI=s3://your-pressly-backups/postgres \
  /opt/pressly/repo/infra/aws/lightsail/backup-postgres.sh
```

Cron example:

```txt
15 3 * * * PRESSLY_BACKUP_S3_URI=s3://your-pressly-backups/postgres /opt/pressly/repo/infra/aws/lightsail/backup-postgres.sh >> /var/log/pressly-backup.log 2>&1
```

Also enable Lightsail automatic snapshots.

Database dumps are for database recovery.

Snapshots are for machine recovery.

Practice restores before trusting backups:

```bash
less /opt/pressly/repo/infra/aws/docs/restore-postgres-drill.md
```

Production recovery steps live in `infra/aws/docs/restore-postgres.md`.

## Emergency Runbooks

Use this choice first:

```txt
bad release, database is okay -> rollback
data corruption or machine loss -> S3 recovery
```

### Quickest Step By Step For Rollback

Rollback redeploys the previous release.

It does not undo destructive migrations or data corruption.

1. SSH into the server.

```bash
ssh ubuntu@<server>
```

2. Run rollback.

```bash
/opt/pressly/repo/infra/aws/lightsail/rollback.sh
```

3. Check health.

```bash
curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
```

Use an exact SHA when needed:

```bash
DEPLOY_REF=<known-good-sha> /opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

### Quickest Step By Step For S3 Recovery

Production recovery is destructive.

Prefer the full runbook when there is time:

```bash
less /opt/pressly/repo/infra/aws/docs/restore-postgres.md
```

1. Choose and copy the backup.

```bash
AWS_PROFILE=pressly-backup aws s3 ls s3://bucket-a5tjsz/postgres/

AWS_PROFILE=pressly-backup aws s3 cp \
  s3://bucket-a5tjsz/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  /opt/pressly/backups/postgres/
```

2. Stop app writers.

```bash
cd /opt/pressly/repo

docker compose \
  --env-file /opt/pressly/.env.production \
  -f infra/aws/lightsail/docker-compose.production.yml \
  stop api web
```

3. Restore Postgres.

```bash
gpg --decrypt \
  --batch \
  --passphrase-file /opt/pressly/backup-passphrase.txt \
  /opt/pressly/backups/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  | gunzip \
  | docker compose \
      --env-file /opt/pressly/.env.production \
      -f infra/aws/lightsail/docker-compose.production.yml \
      exec -T postgres \
      psql -U pressly -d pressly -v ON_ERROR_STOP=1 \
        -c 'drop schema if exists public cascade;' \
        -c 'create schema public;' \
        -f -
```

4. Start and check.

```bash
docker compose \
  --env-file /opt/pressly/.env.production \
  -f infra/aws/lightsail/docker-compose.production.yml \
  up -d --wait

curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
```
