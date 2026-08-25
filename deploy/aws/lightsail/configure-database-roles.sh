#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
ROLE_ENV_FILE="${PRESSLY_DATABASE_ROLES_ENV_FILE:-$ENV_DIR/database-roles.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/deploy/aws/lightsail/docker-compose.production.yml}"
ROLE_SQL="${PRESSLY_DATABASE_ROLES_SQL:-$REPO_DIR/deploy/postgres/configure-roles.sql}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
OPERATION_LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_LOCK_FILE="$OPERATION_LOCK_DIR/postgres-backup.lock"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
CLEAN_EPOCH_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch.json}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'

# Compose validates all required image variables even when only Postgres starts.
export PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_WORKER_IMAGE="${PRESSLY_WORKER_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_PROCESSOR_IMAGE="${PRESSLY_PROCESSOR_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_CONTROL_IMAGE="${PRESSLY_CONTROL_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_RELEASE_SHA="${PRESSLY_RELEASE_SHA:-0000000000000000000000000000000000000000}"
export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"

command -v flock >/dev/null || {
  echo "flock is required to configure database roles." >&2
  exit 1
}
mkdir -p "$OPERATION_LOCK_DIR"
chmod 700 "$OPERATION_LOCK_DIR"
exec 9> "$DEPLOY_LOCK_FILE"
if ! flock --nonblock 9; then
  echo "Another deployment, rollback, restore, or role configuration is running." >&2
  exit 75
fi
exec 8> "$BACKUP_LOCK_FILE"
if ! flock --nonblock 8; then
  echo "A Postgres backup or restore is already running." >&2
  exit 75
fi
if [[ -e "$RESTORE_JOURNAL_FILE" || -L "$RESTORE_JOURNAL_FILE" ]]; then
  echo "Active Postgres restore journal blocks database role changes: $RESTORE_JOURNAL_FILE" >&2
  exit 75
fi
if [[ -e "$CLEAN_EPOCH_JOURNAL_FILE" || -L "$CLEAN_EPOCH_JOURNAL_FILE" ]]; then
  echo "Active clean-epoch journal blocks standalone role changes: $CLEAN_EPOCH_JOURNAL_FILE" >&2
  exit 75
fi

for env_file in "$COMPOSE_ENV_FILE" "$POSTGRES_ENV_FILE" "$ROLE_ENV_FILE"; do
  if [[ ! -f "$env_file" || "$(stat -c '%a' "$env_file")" != "600" ]]; then
    echo "Expected a mode-600 environment file: $env_file" >&2
    exit 1
  fi
done

set -a
# shellcheck disable=SC1090
source "$POSTGRES_ENV_FILE"
# shellcheck disable=SC1090
source "$ROLE_ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PRESSLY_MIGRATION_PASSWORD:?PRESSLY_MIGRATION_PASSWORD is required}"
: "${PRESSLY_RUNTIME_PASSWORD:?PRESSLY_RUNTIME_PASSWORD is required}"
: "${PRESSLY_BACKUP_PASSWORD:?PRESSLY_BACKUP_PASSWORD is required}"

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --wait postgres

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T postgres \
  psql \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" \
    -v database_name="$POSTGRES_DB" \
    -v migration_password="$PRESSLY_MIGRATION_PASSWORD" \
    -v runtime_password="$PRESSLY_RUNTIME_PASSWORD" \
    -v backup_password="$PRESSLY_BACKUP_PASSWORD" \
    -f - < "$ROLE_SQL"

echo "Configured migration, runtime, and backup database roles."
