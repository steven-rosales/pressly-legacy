#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_FILE="${PRESSLY_ENV_FILE:-$APP_ROOT/.env.production}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
BACKUP_DIR="${PRESSLY_BACKUP_DIR:-$APP_ROOT/backups/postgres}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-$APP_ROOT/backup-passphrase.txt}"
RETENTION_DAYS="${PRESSLY_BACKUP_RETENTION_DAYS:-14}"
S3_URI="${PRESSLY_BACKUP_S3_URI:-}"

export PRESSLY_ENV_FILE="$ENV_FILE"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then
  echo "Invalid env file permissions. Expected 600: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -f "$PASSPHRASE_FILE" ]]; then
  echo "Missing backup passphrase file: $PASSPHRASE_FILE" >&2
  exit 1
fi

if [[ "$(stat -c '%a' "$PASSPHRASE_FILE")" != "600" ]]; then
  echo "Invalid backup passphrase permissions. Expected 600: $PASSPHRASE_FILE" >&2
  exit 1
fi

command -v gpg >/dev/null || {
  echo "gpg is required for encrypted backups." >&2
  exit 1
}

if [[ -n "$S3_URI" ]]; then
  command -v aws >/dev/null || {
    echo "aws CLI is required when PRESSLY_BACKUP_S3_URI is set." >&2
    exit 1
  }
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/pressly-$timestamp.sql.gz.gpg"

postgres_db="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres printenv POSTGRES_DB \
    | tr -d '\r'
)"
postgres_user="$(
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres printenv POSTGRES_USER \
    | tr -d '\r'
)"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T postgres pg_dump --no-owner --no-privileges -U "$postgres_user" -d "$postgres_db" \
  | gzip -9 \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file "$PASSPHRASE_FILE" \
  > "$backup_file"

chmod 600 "$backup_file"

if [[ -n "$S3_URI" ]]; then
  aws s3 cp "$backup_file" "$S3_URI/"
fi

find "$BACKUP_DIR" -type f -name '*.sql.gz.gpg' -mtime +"$RETENTION_DAYS" -delete

echo "Created encrypted backup: $backup_file"
