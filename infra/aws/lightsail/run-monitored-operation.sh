#!/usr/bin/env bash
set -euo pipefail
umask 077

OPERATION="${1:-}"
APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
WORKER_ENV_FILE="${PRESSLY_WORKER_ENV_FILE:-$APP_ROOT/env/worker.env}"
SENTRY_BIN="${PRESSLY_SENTRY_BIN:-/usr/local/bin/sentry}"
BACKUP_SCRIPT="${PRESSLY_BACKUP_SCRIPT:-$REPO_DIR/infra/aws/lightsail/backup-postgres.sh}"
HOST_CAPACITY_SCRIPT="${PRESSLY_HOST_CAPACITY_SCRIPT:-$REPO_DIR/infra/aws/lightsail/check-host-capacity.sh}"
LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_TIMEOUT="${PRESSLY_BACKUP_TIMEOUT:-25m}"
HOST_CAPACITY_TIMEOUT="${PRESSLY_HOST_CAPACITY_TIMEOUT:-1m}"

validate_timeout() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[1-9][0-9]*[smh]$ ]]; then
    echo "$name must be a positive duration ending in s, m, or h." >&2
    exit 1
  fi
}

read_env_value() {
  local env_file="$1"
  local key="$2"
  local line
  local value=''
  local found=0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    if [[ "$line" != "$key="* ]]; then
      continue
    fi

    if [[ "$found" -eq 1 ]]; then
      echo "Duplicate $key entry in $env_file." >&2
      return 1
    fi

    value="${line#*=}"
    found=1
  done < "$env_file"

  if [[ "$found" -ne 1 || -z "$value" ]]; then
    echo "Missing $key entry in $env_file." >&2
    return 1
  fi

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

if [[ ! -x "$SENTRY_BIN" ]]; then
  echo "Missing executable Sentry CLI: $SENTRY_BIN" >&2
  exit 1
fi

for command in flock timeout; do
  if ! command -v "$command" >/dev/null; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

validate_timeout PRESSLY_BACKUP_TIMEOUT "$BACKUP_TIMEOUT"
validate_timeout PRESSLY_HOST_CAPACITY_TIMEOUT "$HOST_CAPACITY_TIMEOUT"
mkdir -p "$LOCK_DIR"
chmod 700 "$LOCK_DIR"

if [[ -z "${SENTRY_DSN:-}" ]]; then
  if [[ ! -f "$WORKER_ENV_FILE" ]]; then
    echo "Missing Worker environment file: $WORKER_ENV_FILE" >&2
    exit 1
  fi
  if [[ "$(stat -c '%a' "$WORKER_ENV_FILE")" != '600' ]]; then
    echo "Invalid permissions. Expected 600: $WORKER_ENV_FILE" >&2
    exit 1
  fi
  SENTRY_DSN="$(read_env_value "$WORKER_ENV_FILE" SENTRY_DSN)"
  export SENTRY_DSN
fi

if [[ "$SENTRY_DSN" != https://* ]]; then
  echo "SENTRY_DSN must use HTTPS." >&2
  exit 1
fi

case "$OPERATION" in
  backup)
    if [[ -z "${PRESSLY_BACKUP_S3_URI:-}" || \
      ! "$PRESSLY_BACKUP_S3_URI" =~ ^s3://[^/]+/.+ ]]; then
      echo "PRESSLY_BACKUP_S3_URI must be an S3-compatible bucket prefix." >&2
      exit 1
    fi
    if [[ ! -x "$BACKUP_SCRIPT" ]]; then
      echo "Missing executable backup script: $BACKUP_SCRIPT" >&2
      exit 1
    fi

    exec "$SENTRY_BIN" monitor run pressly-postgres-backup \
      --environment production \
      --schedule '15 3 * * *' \
      --check-in-margin 30 \
      --max-runtime 30 \
      --timezone UTC \
      --failure-issue-threshold 1 \
      --recovery-threshold 1 \
      -- flock --nonblock "$LOCK_DIR/postgres-backup.lock" \
      timeout --signal=TERM --kill-after=30s "$BACKUP_TIMEOUT" \
      env PRESSLY_BACKUP_S3_URI="$PRESSLY_BACKUP_S3_URI" "$BACKUP_SCRIPT"
    ;;
  host-capacity)
    if [[ ! -x "$HOST_CAPACITY_SCRIPT" ]]; then
      echo "Missing executable host-capacity script: $HOST_CAPACITY_SCRIPT" >&2
      exit 1
    fi

    exec "$SENTRY_BIN" monitor run pressly-host-capacity \
      --environment production \
      --schedule '*/5 * * * *' \
      --check-in-margin 2 \
      --max-runtime 2 \
      --timezone UTC \
      --failure-issue-threshold 3 \
      --recovery-threshold 3 \
      -- flock --nonblock "$LOCK_DIR/host-capacity.lock" \
      timeout --signal=TERM --kill-after=10s "$HOST_CAPACITY_TIMEOUT" \
      "$HOST_CAPACITY_SCRIPT"
    ;;
  *)
    echo "Usage: run-monitored-operation.sh backup|host-capacity" >&2
    exit 1
    ;;
esac
