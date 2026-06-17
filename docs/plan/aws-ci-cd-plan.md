# Low-Cost AWS CI/CD Implementation Plan

This plan is for deploying Pressly on AWS for about **$10-$25/month** while keeping the system clean enough to evolve later.

The important decision:

```txt
Use one Lightsail VPS now.
Use Docker Compose on the VPS.
Run Postgres on the VPS.
Back up Postgres outside the VPS.
Upgrade to RDS/ECS later only when the product needs it.
```

This is intentionally not the full ECS/RDS/ALB/NAT Gateway architecture.

That architecture is valid later, but it is not the least-cost path.

## 1. Target Budget

Start here:

| Piece       | AWS service                  | Monthly target |
| ----------- | ---------------------------- | -------------: |
| Runtime     | Lightsail 2 GB Linux VPS     |      about $12 |
| Database    | Postgres container on VPS    |       included |
| Reverse TLS | Caddy container              |       included |
| Backups     | S3 or Lightsail object store |     about $1-3 |
| Snapshots   | Lightsail automatic snapshot |       variable |
| DNS         | Route53 or existing DNS      |     about $0-1 |

Expected first version:

```txt
$12-$18/month
```

If the 2 GB instance is too tight, move to the 4 GB Lightsail instance:

```txt
$24/month before backup/snapshot storage
```

That is still simple, but it can drift slightly above $25 once backups are included.

Use the 2 GB instance first unless the containers prove they need more memory.

## 2. Target Shape

```txt
Internet
  -> DNS
  -> Lightsail static IP
  -> Caddy container
    -> pressly-web container
    -> pressly-api container
    -> pressly-postgres container
    -> backup job container/script
```

The server owns runtime composition:

```txt
/opt/pressly
  docker-compose.production.yml
  .env.production
  Caddyfile
  backups/
```

The repo owns source code, Dockerfiles, CI, and deploy scripts.

The production server owns secrets and persistent data.

## 3. Non-Negotiable Rules

### Do not expose Postgres

Postgres should not bind to a public port.

Good:

```yaml
postgres:
  ports: []
```

or no `ports` key at all.

The API connects through the Docker Compose network:

```txt
postgres://pressly:<password>@postgres:5432/pressly
```

### Only expose HTTP and HTTPS

Public firewall:

```txt
80/tcp
443/tcp
22/tcp restricted to your IP when possible
```

Do not expose:

```txt
5432/tcp
4000/tcp
3000/tcp
```

Caddy is the only public app entrypoint.

### Keep production secrets off GitHub

GitHub can store the SSH deploy key.

GitHub should not store `DATABASE_URL`, `AUTH_SECRET`, owner password, or Postgres password for this version.

Those belong on the server in:

```txt
/opt/pressly/.env.production
```

### Run migrations before app restart

Deploy order:

```txt
pull source
  -> build images
  -> run db migration
  -> restart services
  -> health check
```

Do not manually edit production tables as the normal path.

### Backups must leave the box

An on-box Postgres volume is acceptable only if backups leave the VPS.

Required:

```txt
nightly encrypted pg_dump
upload to S3 or Lightsail object storage
retain at least 7-14 days
test restore manually before trusting it
```

Lightsail snapshots help with machine recovery, but database dumps are still needed because they are easier to restore and inspect.

## 4. Files To Modify

```txt
.github/workflows/ci.yml
apps/api/Dockerfile
package.json
```

## 5. Files To Add

```txt
.github/workflows/deploy-production.yml
infra/aws/lightsail/Caddyfile
infra/aws/lightsail/docker-compose.production.yml
infra/aws/lightsail/deploy.sh
infra/aws/lightsail/backup-postgres.sh
infra/aws/lightsail/restore-postgres.md
infra/aws/lightsail/README.md
```

Optional:

```txt
apps/web/src/app/health/route.ts
```

The API already has:

```txt
apps/api/src/routes/health.routes.ts
```

Keep the API readiness endpoint:

```txt
/health/ready
```

## 6. Phase 1: Fix Production Docker Builds

The API Dockerfile should build correctly before any deploy automation exists.

Current risk:

```txt
apps/api/Dockerfile installs workspace deps before all workspace package manifests are copied.
```

Minimum fix:

```dockerfile
COPY apps/cli/package.json apps/cli/package.json
COPY apps/processor/package.json apps/processor/package.json
COPY modules/auth/package.json modules/auth/package.json
```

Then verify:

```bash
docker build --target runner -f apps/api/Dockerfile -t pressly-api:ci .
docker build --target runner -f apps/web/Dockerfile -t pressly-web:ci .
```

Do this first.

If local runner images fail, production deploys will fail too.

## 7. Phase 2: Keep CI Boring

CI should prove the commit is releasable.

Update `.github/workflows/ci.yml` to run:

```txt
format check
lint
typecheck
unit tests
integration tests with GitHub Postgres service
API Docker runner build
web Docker runner build
```

Use a GitHub Actions Postgres service for integration tests.

CI database URL:

```txt
postgres://pressly:pressly@localhost:5432/pressly_test
```

Expected CI commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
DATABASE_URL=postgres://pressly:pressly@localhost:5432/pressly_test pnpm -F @pressly/db migrate
PRESSLY_TEST_DATABASE_URL=postgres://pressly:pressly@localhost:5432/pressly_test pnpm -F @pressly/auth-module test:integration
PRESSLY_TEST_DATABASE_URL=postgres://pressly:pressly@localhost:5432/pressly_test pnpm -F @pressly/pricing test:integration
docker build --target runner -f apps/api/Dockerfile -t pressly-api:ci .
docker build --target runner -f apps/web/Dockerfile -t pressly-web:ci .
```

Add one root script for local parity:

```json
{
  "test:int": "pnpm test:auth:int && pnpm test:pricing:int"
}
```

Keep CI separate from deployment.

## 8. Phase 3: Create The Lightsail Server

Create one Lightsail Linux instance.

Default recommendation:

```txt
Small 2 GB Linux with public IPv4
```

Install:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git ufw
```

Install Docker using the official Docker install flow.

Then:

```bash
sudo usermod -aG docker ubuntu
sudo mkdir -p /opt/pressly
sudo chown -R ubuntu:ubuntu /opt/pressly
```

Firewall:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from <your-ip> to any port 22 proto tcp
sudo ufw enable
```

Lightsail firewall should match this.

## 9. Phase 4: Production Compose

Add:

```txt
infra/aws/lightsail/docker-compose.production.yml
```

Shape:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      web:
        condition: service_healthy
      api:
        condition: service_healthy

  web:
    build:
      context: ../../..
      dockerfile: apps/web/Dockerfile
      target: runner
    env_file:
      - ${PRESSLY_ENV_FILE:-/opt/pressly/.env.production}
    expose:
      - '3000'
    depends_on:
      api:
        condition: service_healthy

  api:
    build:
      context: ../../..
      dockerfile: apps/api/Dockerfile
      target: runner
    env_file:
      - ${PRESSLY_ENV_FILE:-/opt/pressly/.env.production}
    expose:
      - '4000'
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:18-bookworm
    environment:
      POSTGRES_DB: pressly
      POSTGRES_USER: pressly
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U pressly -d pressly']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  postgres_data:
  caddy_data:
  caddy_config:
```

Adjust build context paths if the compose file is copied outside the repo.

The final implementation should use one stable convention:

```txt
Keep the repo at /opt/pressly/repo.
Keep secrets at /opt/pressly/.env.production.
Run compose through /opt/pressly/repo/infra/aws/lightsail/docker-compose.production.yml.
```

Do not mix both.

## 10. Phase 5: Caddy Routing

Add:

```txt
infra/aws/lightsail/Caddyfile
```

Shape:

```txt
app.example.com {
  reverse_proxy web:3000
}

api.example.com {
  reverse_proxy api:4000
}
```

For the cheapest setup, use your existing DNS provider and point records to the Lightsail static IP.

Route53 is fine, but not required.

## 11. Phase 6: Server Env File

Create this manually on the server:

```txt
/opt/pressly/.env.production
```

Required API values:

```txt
NODE_ENV=production
API_HOST=0.0.0.0
API_PORT=4000
DATABASE_URL=postgres://pressly:<password>@postgres:5432/pressly
DATABASE_MAX_CONNECTIONS=10
LOG_LEVEL=info
CORS_ORIGIN=https://app.example.com
AUTH_SECRET=<strong-random-secret>
AUTH_SESSION_TTL_MINUTES=720
AUTH_LOGIN_WINDOW_MINUTES=15
AUTH_LOGIN_MAX_FAILURES=8
AUTH_FRESH_SESSION_MAX_AGE_MINUTES=15
FEATURE_METRICS_ENABLED=false
FEATURE_JOBS_ENABLED=false
SENTRY_ENABLED=false
POSTHOG_ENABLED=false
```

Required web values:

```txt
HOSTNAME=0.0.0.0
PORT=3000
API_BASE_URL=https://api.example.com
NEXT_PUBLIC_API_BASE_URL=https://api.example.com
NEXT_PUBLIC_ANALYTICS_ENABLED=false
```

Required Postgres value:

```txt
POSTGRES_PASSWORD=<strong-random-password>
```

Permissions:

```bash
chmod 600 /opt/pressly/.env.production
```

## 12. Phase 7: Deploy Script

Add:

```txt
infra/aws/lightsail/deploy.sh
```

Shape:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_FILE="${PRESSLY_ENV_FILE:-$APP_ROOT/.env.production}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

cd "$REPO_DIR"

git fetch --prune origin
git checkout "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  build

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm api pnpm -F @pressly/db migrate

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans --wait

curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
```

This is intentionally simple.

Later, this can be replaced with image publishing and pulling.

For now, building on the VPS is acceptable because the system is small and the budget matters.

## 13. Phase 8: GitHub Deploy Workflow

Add:

```txt
.github/workflows/deploy-production.yml
```

Workflow shape:

```txt
manual workflow_dispatch
production environment approval
SSH into Lightsail
run /opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

GitHub secrets:

```txt
LIGHTSAIL_HOST
LIGHTSAIL_USER
LIGHTSAIL_SSH_KEY
```

Use GitHub's production environment protection so deployment secrets are not available until approval passes.

This workflow should not contain app secrets.

## 14. Phase 9: Backups

Add:

```txt
infra/aws/lightsail/backup-postgres.sh
```

Shape:

```bash
#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="/opt/pressly/backups"
mkdir -p "$backup_dir"

docker compose \
  --env-file /opt/pressly/.env.production \
  -f /opt/pressly/repo/infra/aws/lightsail/docker-compose.production.yml \
  exec -T postgres pg_dump -U pressly -d pressly \
  | gzip \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file /opt/pressly/backup-passphrase.txt \
  > "$backup_dir/pressly-$timestamp.sql.gz.gpg"

aws s3 cp "$backup_dir/pressly-$timestamp.sql.gz.gpg" "s3://<bucket>/postgres/"

find "$backup_dir" -type f -name '*.sql.gz.gpg' -mtime +7 -delete
```

Run nightly with cron:

```txt
15 3 * * * /opt/pressly/repo/infra/aws/lightsail/backup-postgres.sh >> /var/log/pressly-backup.log 2>&1
```

Backup rules:

```txt
encrypt before upload
keep at least 7 daily backups
do not rely only on instance snapshots
test restore before calling backups done
```

Also enable Lightsail automatic snapshots for the instance.

Snapshots are machine recovery.

`pg_dump` is database recovery.

You want both.

## 15. Phase 10: First Owner Bootstrap

Do not put owner bootstrap in deploy.

Run it manually on the server after the first successful deploy:

```bash
cd /opt/pressly/repo

read -rsp 'Owner password: ' PRESSLY_OWNER_PASSWORD
printf '\n'

printf '%s\n' "$PRESSLY_OWNER_PASSWORD" \
  | PRESSLY_BOOTSTRAP_OWNER_EMAIL='owner@example.com' \
    PRESSLY_BOOTSTRAP_OWNER_CONFIRM='bootstrap-first-owner' \
    pnpm auth:bootstrap:owner -- --password-stdin

unset PRESSLY_OWNER_PASSWORD
```

This keeps owner creation explicit and audited.

Do not create the first owner with raw SQL unless this is a break-glass recovery.

## 16. Upgrade Path

This plan should not trap the system.

Upgrade in this order when needed:

### First upgrade

Move Postgres from container to managed database.

Options:

```txt
Lightsail managed database
RDS PostgreSQL
```

Use this when:

```txt
database restore risk matters more than the extra monthly cost
```

### Second upgrade

Publish Docker images instead of building on the VPS.

Options:

```txt
GHCR
ECR
```

Use this when:

```txt
deploys are slow
the server is too small for builds
you want exact image rollback
```

### Third upgrade

Move runtime from Lightsail to ECS.

Use this when:

```txt
one VPS is no longer acceptable
you need rolling deploys across nodes
you need stronger AWS IAM/service isolation
you can justify ALB/RDS/NAT costs
```

## 17. Rollback Model

App rollback:

```bash
cd /opt/pressly/repo
git checkout <known-good-sha>
docker compose --env-file /opt/pressly/.env.production -f infra/aws/lightsail/docker-compose.production.yml up -d --build
```

Database rollback:

```txt
prefer forward fixes for normal migration mistakes
restore pg_dump for serious data corruption
use Lightsail snapshot for full-machine recovery
```

Do not design around destructive migrations.

Use backward-compatible migrations whenever possible:

```txt
expand
deploy
backfill
contract later
```

## 18. Done Definition

This work is done when:

```txt
CI runs quality checks, unit tests, integration tests, and Docker runner builds.
Lightsail instance serves app and API over HTTPS.
Only 80/443 are public, with SSH restricted.
Postgres is private inside Docker Compose.
Production deploy runs through GitHub Actions over SSH.
Deploy runs migrations before restart.
API health returns 200 at /health/ready.
Web health returns 200.
Nightly encrypted pg_dump uploads off-box.
Lightsail automatic snapshots are enabled.
A restore has been tested once.
First owner bootstrap is manual, explicit, and not part of deploy.
```

## 19. Not In This Version

Do not build these yet:

```txt
ECS Fargate
ALB
NAT Gateway
private RDS
multi-AZ
Terraform for all infra
OIDC AWS deploy role
ECR release pipeline
```

Those are good later.

They are not the $10-$25/month path.

## 20. References

Official references used for this plan:

- Lightsail instance bundles: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html
- Lightsail pricing: https://aws.amazon.com/lightsail/pricing/
- Lightsail snapshots: https://docs.aws.amazon.com/lightsail/latest/userguide/understanding-snapshots-in-amazon-lightsail.html
- Lightsail snapshot billing FAQ: https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html
- S3 pricing: https://aws.amazon.com/s3/pricing/
- GitHub deployment environments: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
