# Pressly Lightsail Runtime

Production runs Caddy, web, API, and Postgres on one private Compose network.
Only Caddy publishes host ports. CI builds and scans images; the server pulls
immutable GHCR digests and never rebuilds application source.

## Server Layout

```text
/opt/pressly/
  env/                       service-specific mode-600 files
  repo/                      deployment tooling checkout
  backups/postgres/          short-lived encrypted local copies
  backup-passphrase.txt      mode 600; retain an offline recovery copy
  current-release.json       active SHA and image digests
  previous-release.json      rollback SHA and image digests
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

Deployment is driven by `.github/workflows/deploy-production.yml`. The workflow
supplies the exact source SHA and API/web image digests to `deploy.sh`.

## Quickest Step By Step For Rollback

Rollback reuses the previous immutable image digests. It does not reverse a
destructive migration.

```bash
ssh ubuntu@<server>
/opt/pressly/repo/infra/aws/lightsail/rollback.sh
curl --fail --silent --show-error https://api.trypressly.com/health/ready
curl --fail --silent --show-error https://trypressly.com/health
```

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
