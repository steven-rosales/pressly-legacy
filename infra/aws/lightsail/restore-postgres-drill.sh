#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-/opt/pressly/backup-passphrase.txt}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'
CONTAINER="pressly-restore-drill-$$"
VOLUME="$CONTAINER-data"
DATABASE='pressly_restore_drill'
USER='pressly_restore'
PASSWORD="$(openssl rand -hex 24)"
RESTORE_DUMP="$(mktemp)"
RESTORE_LIST="$(mktemp)"
FILTERED_RESTORE_LIST="$(mktemp)"
started_at="$(date +%s)"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: restore-postgres-drill.sh /path/to/pressly-TIMESTAMP.dump.gpg" >&2
  exit 1
fi

for file in "$BACKUP_FILE.sha256" "$PASSPHRASE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
done

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
  rm -f "$RESTORE_DUMP" "$RESTORE_LIST" "$FILTERED_RESTORE_LIST"
}
trap cleanup EXIT

(cd "$(dirname "$BACKUP_FILE")" && sha256sum --check "$(basename "$BACKUP_FILE").sha256")

docker volume create "$VOLUME" >/dev/null
docker run --detach --name "$CONTAINER" \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --cap-add SETGID \
  --cap-add SETUID \
  --pids-limit 200 \
  --memory 1g \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m \
  --tmpfs /var/run/postgresql:rw,nosuid,nodev,size=16m,uid=999,gid=999 \
  --volume "$VOLUME:/var/lib/postgresql" \
  --env POSTGRES_DB="$DATABASE" \
  --env POSTGRES_USER="$USER" \
  --env POSTGRES_PASSWORD="$PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U "$USER" -d "$DATABASE" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$CONTAINER" pg_isready -U "$USER" -d "$DATABASE" >/dev/null

gpg --decrypt --batch --passphrase-file "$PASSPHRASE_FILE" "$BACKUP_FILE" > "$RESTORE_DUMP"
chmod 600 "$RESTORE_DUMP"

docker cp "$RESTORE_DUMP" "$CONTAINER:/tmp/restore.dump"
docker exec "$CONTAINER" pg_restore --list /tmp/restore.dump > "$RESTORE_LIST"
grep -v 'SEQUENCE SET drizzle __drizzle_migrations_id_seq' \
  "$RESTORE_LIST" > "$FILTERED_RESTORE_LIST"

docker cp "$FILTERED_RESTORE_LIST" "$CONTAINER:/tmp/restore.list"
docker exec "$CONTAINER" \
  pg_restore --exit-on-error --no-owner --no-privileges \
    --use-list=/tmp/restore.list \
    -U "$USER" -d "$DATABASE" /tmp/restore.dump

docker exec "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DATABASE" <<'SQL'
DO $$
DECLARE
  max_migration_id integer;
BEGIN
  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL
     AND to_regclass('drizzle.__drizzle_migrations_id_seq') IS NOT NULL THEN
    SELECT max(id) INTO max_migration_id
    FROM drizzle.__drizzle_migrations;

    PERFORM setval(
      'drizzle.__drizzle_migrations_id_seq'::regclass,
      greatest(coalesce(max_migration_id, 1), 1),
      max_migration_id IS NOT NULL
    );
  END IF;
END $$;
SQL

table_count="$(
  docker exec "$CONTAINER" psql -At -U "$USER" -d "$DATABASE" \
    -c "select count(*) from pg_catalog.pg_tables where schemaname = 'public';"
)"
identity_table="$(
  docker exec "$CONTAINER" psql -At -U "$USER" -d "$DATABASE" \
    -c "select to_regclass('public.auth_identities') is not null;"
)"

if [[ "$table_count" -lt 1 || "$identity_table" != 't' ]]; then
  echo "Restore smoke checks failed." >&2
  exit 1
fi

finished_at="$(date +%s)"
echo "Restore drill passed."
echo "Backup: $(basename "$BACKUP_FILE")"
echo "Public tables: $table_count"
echo "auth_identities present: yes"
echo "Recovery time seconds: $((finished_at - started_at))"
echo "Production volume touched: no"
