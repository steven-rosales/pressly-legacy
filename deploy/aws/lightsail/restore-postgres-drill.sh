#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_FILE="${1:-}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-/opt/pressly/backup-passphrase.txt}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'
CONTAINER="pressly-restore-drill-$$"
VOLUME="$CONTAINER-data"
DATABASE='pressly_restore_drill'
USER='pressly_restore'
PASSWORD="$(openssl rand -hex 24)"
RESTORE_WORKDIR="$(mktemp -d)"
RESTORE_DUMP="$RESTORE_WORKDIR/restore.dump"
RESTORE_LIST="$RESTORE_WORKDIR/restore.list.raw"
FILTERED_RESTORE_LIST="$RESTORE_WORKDIR/restore.list"
started_at="$(date +%s)"
PHASE='preflight validation'

fail() {
  echo "Restore drill failed: $*" >&2
  exit 1
}

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
  local exit_code="$?"
  local cleanup_failed=false
  trap - ERR EXIT
  set +e
  if ((exit_code != 0)) && docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo 'Restore drill container state:' >&2
    docker inspect \
      --format 'status={{.State.Status}} exitCode={{.State.ExitCode}} oomKilled={{.State.OOMKilled}} error={{json .State.Error}}' \
      "$CONTAINER" >&2 || true
    docker logs --tail 200 "$CONTAINER" >&2 || true
  fi
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || cleanup_failed=true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || cleanup_failed=true
  rm -rf "$RESTORE_WORKDIR" || cleanup_failed=true
  if ((exit_code == 0)) && [[ "$cleanup_failed" == true ]]; then
    echo 'Restore drill passed, but disposable resource cleanup failed.' >&2
    exit_code=1
  fi
  exit "$exit_code"
}

report_error() {
  local exit_code="$?"
  trap - ERR
  echo "Restore drill failed during $PHASE (exit $exit_code)." >&2
  exit "$exit_code"
}

wait_for_final_postgres() {
  local ready=false
  local state
  for _ in $(seq 1 30); do
    state="$(docker inspect --format '{{.State.Status}}' "$CONTAINER")"
    if [[ "$state" == exited || "$state" == dead ]]; then
      fail "isolated PostgreSQL container stopped with state $state"
    fi
    if docker exec "$CONTAINER" sh -ec \
      'test "$(cat /proc/1/comm)" = postgres' >/dev/null 2>&1 &&
      docker exec "$CONTAINER" \
        pg_isready -U "$USER" -d "$DATABASE" >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] ||
    fail 'isolated PostgreSQL did not reach its final postmaster'
}

trap cleanup EXIT
trap report_error ERR

PHASE='encrypted checksum verification'
(cd "$(dirname "$BACKUP_FILE")" && sha256sum --check "$(basename "$BACKUP_FILE").sha256")

PHASE='isolated PostgreSQL volume creation'
docker volume create "$VOLUME" >/dev/null
PHASE='isolated PostgreSQL container start'
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
  --volume "$RESTORE_WORKDIR:/restore:ro" \
  --env POSTGRES_DB="$DATABASE" \
  --env POSTGRES_USER="$USER" \
  --env POSTGRES_PASSWORD="$PASSWORD" \
  "$POSTGRES_IMAGE" >/dev/null

PHASE='final PostgreSQL postmaster readiness'
wait_for_final_postgres

PHASE='backup decryption'
gpg --decrypt --batch --passphrase-file "$PASSPHRASE_FILE" "$BACKUP_FILE" > "$RESTORE_DUMP"
chmod 600 "$RESTORE_DUMP"

PHASE='backup archive inspection'
docker exec "$CONTAINER" pg_restore --list /restore/restore.dump > "$RESTORE_LIST"
PHASE='backup archive filtering'
sed '/SEQUENCE SET drizzle __drizzle_migrations_id_seq/d' \
  "$RESTORE_LIST" > "$FILTERED_RESTORE_LIST"
[[ -s "$FILTERED_RESTORE_LIST" ]] || fail 'backup archive restore list is empty'

PHASE='backup archive restore'
docker exec "$CONTAINER" \
  pg_restore --exit-on-error --no-owner --no-privileges \
    --use-list=/restore/restore.list \
    -U "$USER" -d "$DATABASE" /restore/restore.dump

PHASE='migration sequence restoration'
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

PHASE='restored schema smoke checks'
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

PHASE='complete'
finished_at="$(date +%s)"
echo "Restore drill passed."
echo "Backup: $(basename "$BACKUP_FILE")"
echo "Public tables: $table_count"
echo "auth_identities present: yes"
echo "Recovery time seconds: $((finished_at - started_at))"
echo "Production volume touched: no"
