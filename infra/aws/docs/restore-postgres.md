# Restore Postgres From Backup

Use this for production recovery.

For a safe practice restore, use `infra/aws/docs/restore-postgres-drill.md`
instead. The drill restores into a disposable container and does not touch the
production Postgres volume.

The normal production rule is:

```txt
prefer forward fixes for normal migration mistakes
restore from backup for serious data corruption or machine loss
```

## Before Production Restore

Production restore is destructive.

Before running it, confirm:

```txt
fresh backup object chosen
restore drill has passed at least once
api and web writers are stopped
expected data loss window is understood
current app release is known
owner/operator approved the restore
```

## 1. Copy The Backup To The Server

If the backup is in S3:

```bash
AWS_PROFILE=pressly-backup aws s3 ls s3://bucket-a5tjsz/postgres/

AWS_PROFILE=pressly-backup aws s3 cp \
  s3://bucket-a5tjsz/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  /opt/pressly/backups/postgres/
```

## 2. Stop Writers

```bash
cd /opt/pressly/repo

docker compose \
  --env-file /opt/pressly/.env.production \
  -f infra/aws/lightsail/docker-compose.production.yml \
  stop api web
```

## 3. Decrypt And Restore

This drops and recreates the `public` schema.

```bash
cd /opt/pressly/repo

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

## 4. Start And Check

```bash
docker compose \
  --env-file /opt/pressly/.env.production \
  -f infra/aws/lightsail/docker-compose.production.yml \
  up -d --wait

curl --fail --silent --show-error https://api.trypressly.com/health/ready
```

## 5. Practice Once

Before trusting production backups, test the drill against a disposable
database:

```bash
less /opt/pressly/repo/infra/aws/docs/restore-postgres-drill.md
```
