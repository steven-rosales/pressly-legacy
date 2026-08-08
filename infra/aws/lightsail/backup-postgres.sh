#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
BACKUP_ENV_FILE="${PRESSLY_BACKUP_ENV_FILE:-$ENV_DIR/backup.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
BACKUP_DIR="${PRESSLY_BACKUP_DIR:-$APP_ROOT/backups/postgres}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-$APP_ROOT/backup-passphrase.txt}"
RETENTION_DAYS="${PRESSLY_BACKUP_RETENTION_DAYS:-14}"
S3_URI="${PRESSLY_BACKUP_S3_URI:-}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'

# Compose validates all required image variables even when only backup starts.
export PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_WORKER_IMAGE="${PRESSLY_WORKER_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_PROCESSOR_IMAGE="${PRESSLY_PROCESSOR_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_CONTROL_IMAGE="${PRESSLY_CONTROL_IMAGE:-$POSTGRES_IMAGE}"
export PRESSLY_RELEASE_SHA="${PRESSLY_RELEASE_SHA:-0000000000000000000000000000000000000000}"
export PRESSLY_BACKUP_ENV_FILE="$BACKUP_ENV_FILE"

for file in "$COMPOSE_ENV_FILE" "$BACKUP_ENV_FILE" "$PASSPHRASE_FILE"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing required file: $file" >&2
    exit 1
  fi
  if [[ "$(stat -c '%a' "$file")" != "600" ]]; then
    echo "Invalid permissions. Expected 600: $file" >&2
    exit 1
  fi
done

if [[ -z "$S3_URI" || ! "$S3_URI" =~ ^s3://[^/]+/.+ ]]; then
  echo "PRESSLY_BACKUP_S3_URI must be an S3 bucket prefix." >&2
  exit 1
fi

for command in aws docker gpg sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 1
  }
done

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
basename="pressly-$timestamp.dump.gpg"
backup_file="$BACKUP_DIR/$basename"
checksum_file="$backup_file.sha256"
metadata_file="$backup_file.json"
object_uri="${S3_URI%/}/$basename"

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm -T backup \
  pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file "$PASSPHRASE_FILE" \
  > "$backup_file"

chmod 600 "$backup_file"
checksum="$(sha256sum "$backup_file" | cut -d' ' -f1)"
size_bytes="$(stat -c '%s' "$backup_file")"
printf '%s  %s\n' "$checksum" "$basename" > "$checksum_file"
printf '{"createdAt":"%s","object":"%s","sha256":"%s","sizeBytes":%s}\n' \
  "$created_at" "$object_uri" "$checksum" "$size_bytes" > "$metadata_file"
chmod 600 "$checksum_file" "$metadata_file"

aws s3 cp "$backup_file" "$object_uri" --only-show-errors
aws s3 cp "$checksum_file" "$object_uri.sha256" --only-show-errors
aws s3 cp "$metadata_file" "$object_uri.json" --only-show-errors

remote_checksum="$(aws s3 cp "$object_uri" - --only-show-errors | sha256sum | cut -d' ' -f1)"
if [[ "$remote_checksum" != "$checksum" ]]; then
  echo "Uploaded backup checksum does not match local backup." >&2
  exit 1
fi

find "$BACKUP_DIR" -type f \( -name '*.dump.gpg' -o -name '*.dump.gpg.sha256' -o -name '*.dump.gpg.json' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup object: $object_uri"
echo "Recovery point: $created_at"
echo "Encrypted bytes: $size_bytes"
echo "SHA-256 verified after upload: $checksum"
