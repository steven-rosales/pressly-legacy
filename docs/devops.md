# Devops

Pressly currently uses GitHub Actions for verification and a low-cost AWS
Lightsail server for production runtime.

The production stack is:

```txt
GitHub
  -> CI verifies commits
  -> manual deploy workflow SSHes into Lightsail
  -> Lightsail pulls source
  -> Docker Compose builds and runs Caddy, web, API, and Postgres
```

There is no registry release workflow right now.

Images are built on the Lightsail server from the checked-out source.

## Branch Model

Normal development:

```txt
feature branch
  -> CI
  -> merge to main when ready
  -> manual production deploy from the selected branch
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
web Docker build
API Docker build
```

CI does not need production secrets.

The integration database is a GitHub Actions Postgres service. It is separate
from local Docker and production Docker.

## Production Deploy

`.github/workflows/deploy-production.yml` is manual.

It SSHes into the Lightsail instance and runs:

```txt
/opt/pressly/repo/infra/aws/lightsail/deploy.sh
```

The deploy script:

```txt
validates the branch
pulls the selected branch
builds production images
runs migrations
starts services
checks API and web health
```

Production secrets live on the server, not in GitHub:

```txt
/opt/pressly/.env.production
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
22/tcp restricted to your IP
```

Do not expose:

```txt
5432/tcp
4000/tcp
3000/tcp
```

Postgres is private inside the Docker network.

The API connects to it with:

```txt
postgres://pressly:<password>@postgres:5432/pressly
```

## Local Docker

Local Docker still uses the root `docker-compose.yml`.

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
