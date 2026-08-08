# Postgres Restore Drill

This proves one production backup artifact in an isolated disposable database.
It never mounts the production volume. It proves that the encrypted bytes,
checksum, `public` schema, and Drizzle ledger are restorable; it does not prove
the production cutover procedure.

## Quickest Step By Step For A Restore Drill

1. Download the backup, checksum, and metadata.

```bash
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.sha256 /opt/pressly/backups/postgres/
aws s3 cp s3://<bucket>/postgres/pressly-<timestamp>.dump.gpg.json /opt/pressly/backups/postgres/
```

2. Run the isolated drill.

```bash
/opt/pressly/ops/current/restore-postgres-drill.sh \
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

## Production-Shaped Disposable Proof

Run the heavier proof after changing the restore workflow or before accepting a
new recovery design:

```bash
infra/aws/lightsail/restore-postgres-proof.sh
```

It builds the current API tools image, creates a unique Compose project and a
database at the immediately preceding migration, applies the real role policy,
generates the same encrypted custom-archive triplet as production, adds
post-backup divergence, and invokes `restore-postgres.sh` with service
resumption disabled. It proves that:

- both `public` and `drizzle` restore without collisions;
- only pre-backup data reaches the promoted database;
- post-backup state remains in a connection-disabled quarantine;
- the authoritative release pointer, metadata, and verified deployment state
  override deliberately stale environment bindings;
- a provisioned host-identity fixture binds the exact public IP, four HTTPS
  URLs, and their hosts into the durable journal; malformed identity files,
  resume-time target changes, and caller overrides are rejected;
- the current migration upgrades the N-1 backup, and owners, runtime grants,
  and backup read-only access pass;
- abort becomes durable before an unchanged database writer can restart, and a
  fresh process safely resumes abort after candidate removal;
- collision-resistant quarantine names and strict journal/topology ordering
  reject stale or otherwise unreachable database sets instead of treating them
  as a completed cutover;
- a fresh process resumes after simulated power loss at each of the two
  database-rename boundaries using the fsynced exact-identity journal;
- Caddy, API, and Worker remain stopped during the controlled database drill;
  a separate executable fault model proves their restart policies remain `no`
  across a pre-public-verification crash, then become `unless-stopped` only
  when a fresh process resumes from durable `public_verified`; and
- every project container, network, volume, temporary file, and locally built
  proof image is removed afterward.

The harness refuses remote Docker endpoints and any pre-existing project-owned
resource. To reuse an already-built, current API runner image rather than build
one, set `PRESSLY_RESTORE_PROOF_API_IMAGE` to its local image name.
