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
CORS_ORIGIN=https://app.trypressly.com
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
PRESSLY_WEB_DOMAIN=app.trypressly.com
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
DEPLOY_BRANCH=db-modules-setup /opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

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
