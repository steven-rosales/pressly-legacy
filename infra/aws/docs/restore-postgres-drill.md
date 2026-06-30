# Postgres Restore Drill

This proves an encrypted backup in an isolated disposable database. It never
mounts the production volume.

## Quickest Step By Step For A Restore Drill

1. Download the backup, checksum, and metadata.

```bash
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.sha256 /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.json /opt/pressly/backups/postgres/
```

2. Run the isolated drill.

```bash
/opt/pressly/repo/infra/aws/lightsail/restore-postgres-drill.sh \
  /opt/pressly/backups/postgres/pressly-<timestamp>.dump.gpg
```

3. Retain this evidence:

```text
date:
backup object:
recovery point:
recovery time seconds:
checksum: passed
schema smoke check: passed
production volume touched: no
```

The script verifies the encrypted checksum, restores with `pg_restore`, checks
the public schema and `auth_identities`, reports recovery time, and destroys the
disposable container and volume.
