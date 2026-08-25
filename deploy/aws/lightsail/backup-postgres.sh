#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
BACKUP_ENV_FILE="${PRESSLY_BACKUP_ENV_FILE:-$ENV_DIR/backup.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/deploy/aws/lightsail/docker-compose.production.yml}"
BACKUP_DIR="${PRESSLY_BACKUP_DIR:-$APP_ROOT/backups/postgres}"
PASSPHRASE_FILE="${PRESSLY_BACKUP_PASSPHRASE_FILE:-$APP_ROOT/backup-passphrase.txt}"
LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
RETENTION_DAYS="${PRESSLY_BACKUP_RETENTION_DAYS:-14}"
S3_URI="${PRESSLY_BACKUP_S3_URI:-}"
AWS_PROFILE_NAME="${PRESSLY_BACKUP_AWS_PROFILE:-}"
EXPECTED_BUCKET_OWNER="${PRESSLY_BACKUP_AWS_EXPECTED_BUCKET_OWNER:-}"
SECONDARY_S3_URI="${PRESSLY_BACKUP_SECONDARY_S3_URI:-}"
SECONDARY_AWS_PROFILE_NAME="${PRESSLY_BACKUP_SECONDARY_AWS_PROFILE:-}"
SECONDARY_EXPECTED_BUCKET_OWNER="${PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER:-}"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'

validate_profile_name() {
  local name="$1"
  local value="$2"

  if [[ -n "$value" && ! "$value" =~ ^[A-Za-z0-9][A-Za-z0-9_.@+-]*$ ]]; then
    echo "$name must be a simple AWS CLI profile name." >&2
    exit 1
  fi
}

validate_expected_bucket_owner() {
  local name="$1"
  local value="$2"

  if [[ -n "$value" && ! "$value" =~ ^[0-9]{12}$ ]]; then
    echo "$name must be a 12-digit AWS account ID." >&2
    exit 1
  fi
}

bucket_from_s3_uri() {
  local without_scheme="${1#s3://}"
  printf '%s' "${without_scheme%%/*}"
}

aws_with_profile() {
  local profile_name="$1"
  shift
  local -a command=(aws)

  if [[ -n "$profile_name" ]]; then
    command+=(--profile "$profile_name")
  fi
  command+=("$@")
  "${command[@]}"
}

verify_destination_owner() {
  local label="$1"
  local s3_prefix="$2"
  local profile_name="$3"
  local expected_owner="$4"

  if [[ -z "$expected_owner" ]]; then
    return 0
  fi

  if ! aws_with_profile "$profile_name" \
    s3api get-bucket-location \
    --bucket "$(bucket_from_s3_uri "$s3_prefix")" \
    --expected-bucket-owner "$expected_owner" \
    --no-cli-pager >/dev/null; then
    echo "$label bucket owner preflight failed." >&2
    return 1
  fi
}

upload_and_verify_destination() {
  local label="$1"
  local s3_prefix="$2"
  local profile_name="$3"
  local object_uri="${s3_prefix%/}/$basename"
  local local_file suffix remote_uri local_checksum remote_checksum
  local -a local_files=("$backup_file" "$checksum_file" "$metadata_file")

  for local_file in "${local_files[@]}"; do
    suffix="${local_file#"$backup_file"}"
    remote_uri="$object_uri$suffix"
    if ! aws_with_profile "$profile_name" \
      s3 cp "$local_file" "$remote_uri" --only-show-errors; then
      echo "$label upload failed for ${local_file##*/}." >&2
      return 1
    fi
  done

  for local_file in "${local_files[@]}"; do
    suffix="${local_file#"$backup_file"}"
    remote_uri="$object_uri$suffix"
    local_checksum="$(sha256sum "$local_file" | cut -d' ' -f1)"
    if ! remote_checksum="$(
      aws_with_profile "$profile_name" \
        s3 cp "$remote_uri" - --only-show-errors |
        sha256sum | cut -d' ' -f1
    )"; then
      echo "$label readback failed for ${local_file##*/}." >&2
      return 1
    fi
    if [[ "$remote_checksum" != "$local_checksum" ]]; then
      echo "$label readback checksum does not match ${local_file##*/}." >&2
      return 1
    fi
  done
}

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

validate_profile_name PRESSLY_BACKUP_AWS_PROFILE "$AWS_PROFILE_NAME"
validate_expected_bucket_owner \
  PRESSLY_BACKUP_AWS_EXPECTED_BUCKET_OWNER "$EXPECTED_BUCKET_OWNER"

if [[ -z "$SECONDARY_S3_URI" && \
  ( -n "$SECONDARY_AWS_PROFILE_NAME" || -n "$SECONDARY_EXPECTED_BUCKET_OWNER" ) ]]; then
  echo "Secondary AWS settings require PRESSLY_BACKUP_SECONDARY_S3_URI." >&2
  exit 1
fi

if [[ -n "$SECONDARY_S3_URI" ]]; then
  if [[ ! "$SECONDARY_S3_URI" =~ ^s3://[^/]+/.+ ]]; then
    echo "PRESSLY_BACKUP_SECONDARY_S3_URI must be an S3 bucket prefix." >&2
    exit 1
  fi
  validate_profile_name \
    PRESSLY_BACKUP_SECONDARY_AWS_PROFILE "$SECONDARY_AWS_PROFILE_NAME"
  if [[ -z "$SECONDARY_EXPECTED_BUCKET_OWNER" ]]; then
    echo "PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER is required for a secondary destination." >&2
    exit 1
  fi
  validate_expected_bucket_owner \
    PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER \
    "$SECONDARY_EXPECTED_BUCKET_OWNER"
  if [[ "$(bucket_from_s3_uri "$S3_URI")" == \
    "$(bucket_from_s3_uri "$SECONDARY_S3_URI")" ]]; then
    echo "Primary and secondary backups must use different S3 buckets." >&2
    exit 1
  fi
fi

for command in aws docker flock gpg sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required." >&2
    exit 1
  }
done

mkdir -p "$LOCK_DIR"
chmod 700 "$LOCK_DIR"
exec 9> "$LOCK_DIR/postgres-backup.lock"
if ! flock --nonblock 9; then
  echo "Another Postgres backup or restore is already running." >&2
  exit 75
fi
if [[ -e "$RESTORE_JOURNAL_FILE" || -L "$RESTORE_JOURNAL_FILE" ]]; then
  echo "Active Postgres restore journal blocks backup: $RESTORE_JOURNAL_FILE" >&2
  exit 75
fi

destination_preflight_status=0
verify_destination_owner \
  primary "$S3_URI" "$AWS_PROFILE_NAME" "$EXPECTED_BUCKET_OWNER" || \
  destination_preflight_status=1
if [[ -n "$SECONDARY_S3_URI" ]]; then
  verify_destination_owner \
    secondary "$SECONDARY_S3_URI" "$SECONDARY_AWS_PROFILE_NAME" \
    "$SECONDARY_EXPECTED_BUCKET_OWNER" || destination_preflight_status=1
fi
if [[ "$destination_preflight_status" -ne 0 ]]; then
  echo "Backup destination preflight failed." >&2
  exit "$destination_preflight_status"
fi

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
basename="pressly-$timestamp.dump.gpg"
backup_file="$BACKUP_DIR/$basename"
checksum_file="$backup_file.sha256"
metadata_file="$backup_file.json"
object_uri="${S3_URI%/}/$basename"
secondary_object_uri=''
if [[ -n "$SECONDARY_S3_URI" ]]; then
  secondary_object_uri="${SECONDARY_S3_URI%/}/$basename"
fi

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

destination_status=0
upload_and_verify_destination \
  primary "$S3_URI" "$AWS_PROFILE_NAME" || \
  destination_status=1
if [[ -n "$SECONDARY_S3_URI" ]]; then
  upload_and_verify_destination \
    secondary "$SECONDARY_S3_URI" "$SECONDARY_AWS_PROFILE_NAME" || \
    destination_status=1
fi
if [[ "$destination_status" -ne 0 ]]; then
  echo "Backup did not verify at every configured destination." >&2
  exit "$destination_status"
fi

find "$BACKUP_DIR" -type f \( -name '*.dump.gpg' -o -name '*.dump.gpg.sha256' -o -name '*.dump.gpg.json' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup object: $object_uri"
if [[ -n "$secondary_object_uri" ]]; then
  echo "Secondary backup object: $secondary_object_uri"
fi
echo "Recovery point: $created_at"
echo "Encrypted bytes: $size_bytes"
echo "Every configured destination read back the same encrypted triplet."
echo "SHA-256 verified after upload: $checksum"
