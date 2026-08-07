# Restore Production Postgres

Use this only for serious data corruption or machine loss. A code rollback does
not reverse a destructive migration.

## Before Restore

- Obtain owner approval and record the expected data-loss window.
- Choose an object whose checksum and isolated restore drill passed.
- Record the current release manifest and incident request IDs.
- Stop every database writer before changing data. API and Worker are the
  current database-writing services.

## Quickest Step By Step For Recovery

1. Download and verify all three backup objects.

```bash
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.sha256 /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.json /opt/pressly/backups/postgres/
cd /opt/pressly/backups/postgres
sha256sum --check pressly-<timestamp>.dump.gpg.sha256
```

2. Put Web, Processor, and Control into maintenance if operator-facing
   availability matters during recovery. They are frontends, not database
   writers. Then stop both database writers: API and Worker.

```bash
cd /opt/pressly/repo
docker compose --env-file /opt/pressly/env/compose.env \
  -f infra/aws/lightsail/docker-compose.production.yml stop api worker
```

3. Drop the damaged public schema as the migration role.

```bash
docker compose --profile tools --env-file /opt/pressly/env/compose.env \
  -f infra/aws/lightsail/docker-compose.production.yml run --rm -T restore \
  sh -c "psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 \
    -c 'drop schema if exists public cascade' \
    -c 'create schema public'"
```

4. Decrypt and restore through the migration container.

```bash
gpg --decrypt --batch \
  --passphrase-file /opt/pressly/backup-passphrase.txt \
  /opt/pressly/backups/postgres/pressly-<timestamp>.dump.gpg \
  | docker compose --profile tools --env-file /opt/pressly/env/compose.env \
      -f infra/aws/lightsail/docker-compose.production.yml run --rm -T restore \
      sh -c "pg_restore --exit-on-error --no-owner --no-privileges \
        --dbname=\"\$DATABASE_URL\""
```

5. Start services and verify health plus critical reads.

```bash
docker compose --env-file /opt/pressly/env/compose.env \
  -f infra/aws/lightsail/docker-compose.production.yml up -d --wait
curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
```

Record the recovery point, recovery time, health result, and any missing data.
