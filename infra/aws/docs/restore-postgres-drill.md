# Backup Restore Drill

Use this to prove one encrypted S3 backup can restore into a disposable
Postgres container.

This must not touch the production Compose Postgres volume.

## 1. Choose A Backup

List backup objects:

```bash
AWS_PROFILE=pressly-backup aws s3 ls s3://bucket-a5tjsz/postgres/
```

Copy one backup to the server if it is not already present:

```bash
AWS_PROFILE=pressly-backup aws s3 cp \
  s3://bucket-a5tjsz/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  /opt/pressly/backups/postgres/
```

S3 prefixes need the trailing slash.

Use:

```txt
s3://bucket-a5tjsz/postgres/
```

Not:

```txt
s3://bucket-a5tjsz/postgres
```

## 2. Start Disposable Postgres

Start a temporary container outside the production Compose stack:

```bash
docker run --rm --name pressly-restore-drill-postgres \
  -e POSTGRES_DB=pressly_restore_drill \
  -e POSTGRES_USER=pressly \
  -e POSTGRES_PASSWORD=pressly_restore_drill \
  -d postgres:18-bookworm
```

Wait until it accepts connections:

```bash
docker exec pressly-restore-drill-postgres \
  pg_isready -U pressly -d pressly_restore_drill
```

## 3. Restore The Backup

Replace the filename with the backup chosen in step 1:

```bash
gpg --decrypt \
  --batch \
  --passphrase-file /opt/pressly/backup-passphrase.txt \
  /opt/pressly/backups/postgres/pressly-YYYYMMDDTHHMMSSZ.sql.gz.gpg \
  | gunzip \
  | docker exec -i pressly-restore-drill-postgres \
      psql -U pressly -d pressly_restore_drill -v ON_ERROR_STOP=1
```

## 4. Prove The Restore

Check that tables exist:

```bash
docker exec -i pressly-restore-drill-postgres \
  psql -U pressly -d pressly_restore_drill -c '\dt'
```

Check at least one known table:

```bash
docker exec -i pressly-restore-drill-postgres \
  psql -U pressly -d pressly_restore_drill -c 'select count(*) from auth_identites;'
```

Use real table names from the restored output.

## 5. Clean Up

Stop the disposable container:

```bash
docker stop pressly-restore-drill-postgres
```

## Last Verified Drill

```txt
date: 2026-06-18
backup object: s3://bucket-a5tjsz/postgres/pressly-20260616T220418Z.sql.gz.gpg
restored into: pressly-restore-drill-postgres
table listing: passed
data check: select count(*) from auth_identites; returned 1
production volume touched: no
```
