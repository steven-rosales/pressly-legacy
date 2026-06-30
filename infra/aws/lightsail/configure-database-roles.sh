#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
ROLE_ENV_FILE="${PRESSLY_DATABASE_ROLES_ENV_FILE:-$ENV_DIR/database-roles.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
ROLE_SQL="${PRESSLY_DATABASE_ROLES_SQL:-$REPO_DIR/infra/postgres/configure-roles.sql}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'

# Compose validates all required image variables even when only Postgres starts.
export PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"

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
