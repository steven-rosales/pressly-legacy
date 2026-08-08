#!/usr/bin/env bash
set -euo pipefail
umask 077

OPERATION="${1:-}"
APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
WORKER_ENV_FILE="${PRESSLY_WORKER_ENV_FILE:-$APP_ROOT/env/worker.env}"
SENTRY_BIN="${PRESSLY_SENTRY_BIN:-/usr/local/bin/sentry}"
BACKUP_SCRIPT="${PRESSLY_BACKUP_SCRIPT:-$SCRIPT_DIR/backup-postgres.sh}"
HOST_CAPACITY_SCRIPT="${PRESSLY_HOST_CAPACITY_SCRIPT:-$SCRIPT_DIR/check-host-capacity.sh}"
LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_TIMEOUT="${PRESSLY_BACKUP_TIMEOUT:-25m}"
HOST_CAPACITY_TIMEOUT="${PRESSLY_HOST_CAPACITY_TIMEOUT:-1m}"
SENTRY_TIMEOUT="${PRESSLY_SENTRY_TIMEOUT:-20s}"

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

is_valid_sentry_dsn() {
  local dsn="$1"

  [[ "$dsn" =~ ^https://[[:alnum:]._%+~-]+(:[[:alnum:]._%+~-]+)?@[[:alnum:]-]+(\.[[:alnum:]-]+)+(:[1-9][0-9]{0,4})?(/[[:alnum:]._~-]+)*/[0-9]+$ ]]
}

configure_sentry() {
  local permissions
  local resolved_dsn

  if [[ ! -x "$SENTRY_BIN" ]]; then
    echo "Sentry check-in skipped: missing executable CLI: $SENTRY_BIN" >&2
    return 1
  fi

  if [[ -z "${SENTRY_DSN:-}" ]]; then
    if [[ ! -f "$WORKER_ENV_FILE" ]]; then
      echo "Sentry check-in skipped: missing Worker environment file: $WORKER_ENV_FILE" >&2
      return 1
    fi

    if ! permissions="$(stat -c '%a' "$WORKER_ENV_FILE" 2>/dev/null)" || \
      [[ "$permissions" != '600' ]]; then
      echo "Sentry check-in skipped: expected mode 600 on $WORKER_ENV_FILE" >&2
      return 1
    fi

    if ! resolved_dsn="$(read_env_value "$WORKER_ENV_FILE" SENTRY_DSN)"; then
      echo "Sentry check-in skipped: no usable SENTRY_DSN was found." >&2
      return 1
    fi

    SENTRY_DSN="$resolved_dsn"
    export SENTRY_DSN
  fi

  if ! is_valid_sentry_dsn "$SENTRY_DSN"; then
    echo "Sentry check-in skipped: SENTRY_DSN is malformed." >&2
    return 1
  fi
}

report_sentry_check_in() {
  local slug="$1"
  local schedule="$2"
  local check_in_margin="$3"
  local max_runtime="$4"
  local failure_threshold="$5"
  local recovery_threshold="$6"
  local operation_status="$7"
  local sentry_operation_status=0
  local monitor_marker="$LOCK_DIR/.sentry-check-in-$$"
  local sentry_status=0

  # Sentry needs only success versus failure. Use a reserved child status for
  # every failed operation so an ordinary CLI/network exit such as 1, or the
  # outer timeout status 124, cannot masquerade as a delivered failure check-in.
  if [[ "$operation_status" -ne 0 ]]; then
    sentry_operation_status=200
  fi

  if [[ ! "$SENTRY_TIMEOUT" =~ ^[1-9][0-9]*[smh]$ ]]; then
    echo "Sentry check-in skipped: PRESSLY_SENTRY_TIMEOUT must be a positive duration ending in s, m, or h." >&2
    return 0
  fi

  if ! configure_sentry; then
    return 0
  fi

  unlink "$monitor_marker" 2>/dev/null || true
  timeout --signal=TERM --kill-after=5s "$SENTRY_TIMEOUT" \
    "$SENTRY_BIN" monitor run "$slug" \
    --environment production \
    --schedule "$schedule" \
    --check-in-margin "$check_in_margin" \
    --max-runtime "$max_runtime" \
    --timezone UTC \
    --failure-issue-threshold "$failure_threshold" \
    --recovery-threshold "$recovery_threshold" \
    -- sh -c 'printf "invoked\n" > "$2"; exit "$1"' \
    sentry-check-in "$sentry_operation_status" "$monitor_marker" \
    >/dev/null 2>&1 || sentry_status=$?

  if [[ ! -f "$monitor_marker" ]]; then
    echo "Sentry check-in failed: the CLI did not invoke the status reporter." >&2
  elif [[ "$sentry_status" -ne "$sentry_operation_status" ]]; then
    echo "Sentry check-in failed: the CLI returned an unexpected status." >&2
  fi

  unlink "$monitor_marker" 2>/dev/null || true
  return 0
}

for command in flock timeout; do
  if ! command -v "$command" >/dev/null; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

mkdir -p "$LOCK_DIR"
chmod 700 "$LOCK_DIR"

case "$OPERATION" in
  backup)
    validate_timeout PRESSLY_BACKUP_TIMEOUT "$BACKUP_TIMEOUT"
    if [[ -z "${PRESSLY_BACKUP_S3_URI:-}" || \
      ! "$PRESSLY_BACKUP_S3_URI" =~ ^s3://[^/]+/.+ ]]; then
      echo "PRESSLY_BACKUP_S3_URI must be an S3-compatible bucket prefix." >&2
      exit 1
    fi
    if [[ ! -x "$BACKUP_SCRIPT" ]]; then
      echo "Missing executable backup script: $BACKUP_SCRIPT" >&2
      exit 1
    fi

    operation_status=0
    timeout --signal=TERM --kill-after=30s "$BACKUP_TIMEOUT" \
      env \
      PRESSLY_OPERATION_LOCK_DIR="$LOCK_DIR" \
      PRESSLY_BACKUP_S3_URI="$PRESSLY_BACKUP_S3_URI" \
      "$BACKUP_SCRIPT" || \
      operation_status=$?

    report_sentry_check_in \
      pressly-postgres-backup \
      '15 3 * * *' \
      30 \
      30 \
      1 \
      1 \
      "$operation_status"
    exit "$operation_status"
    ;;
  host-capacity)
    validate_timeout PRESSLY_HOST_CAPACITY_TIMEOUT "$HOST_CAPACITY_TIMEOUT"
    if [[ ! -x "$HOST_CAPACITY_SCRIPT" ]]; then
      echo "Missing executable host-capacity script: $HOST_CAPACITY_SCRIPT" >&2
      exit 1
    fi

    operation_status=0
    flock --nonblock "$LOCK_DIR/host-capacity.lock" \
      timeout --signal=TERM --kill-after=10s "$HOST_CAPACITY_TIMEOUT" \
      "$HOST_CAPACITY_SCRIPT" || operation_status=$?

    report_sentry_check_in \
      pressly-host-capacity \
      '*/5 * * * *' \
      2 \
      2 \
      3 \
      3 \
      "$operation_status"
    exit "$operation_status"
    ;;
  *)
    echo "Usage: run-monitored-operation.sh backup|host-capacity" >&2
    exit 1
    ;;
esac
