#!/usr/bin/env bash
set -euo pipefail

preflight_only=false
resume_unverified=false
case "${1:-}" in
  '') ;;
  --preflight-only) preflight_only=true ;;
  --resume-unverified) resume_unverified=true ;;
  *)
    echo "Usage: deploy.sh [--preflight-only|--resume-unverified]" >&2
    exit 2
    ;;
esac

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
CADDY_ENV_FILE="${PRESSLY_CADDY_ENV_FILE:-$ENV_DIR/caddy.env}"
WEB_ENV_FILE="${PRESSLY_WEB_ENV_FILE:-$ENV_DIR/web.env}"
API_ENV_FILE="${PRESSLY_API_ENV_FILE:-$ENV_DIR/api.env}"
WORKER_ENV_FILE="${PRESSLY_WORKER_ENV_FILE:-$ENV_DIR/worker.env}"
PROCESSOR_ENV_FILE="${PRESSLY_PROCESSOR_ENV_FILE:-$ENV_DIR/processor.env}"
CONTROL_ENV_FILE="${PRESSLY_CONTROL_ENV_FILE:-$ENV_DIR/control.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
MIGRATION_ENV_FILE="${PRESSLY_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
BACKUP_ENV_FILE="${PRESSLY_BACKUP_ENV_FILE:-$ENV_DIR/backup.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
API_HEALTH_URL="${PRESSLY_API_HEALTH_URL:-https://api.trypressly.com/health/ready}"
WEB_HEALTH_URL="${PRESSLY_WEB_HEALTH_URL:-https://trypressly.com/health}"
PROCESSOR_HEALTH_URL="${PRESSLY_PROCESSOR_HEALTH_URL:-https://processor.trypressly.com/health}"
CONTROL_HEALTH_URL="${PRESSLY_CONTROL_HEALTH_URL:-https://control.trypressly.com/health}"
EXPECTED_PUBLIC_IP="${PRESSLY_EXPECTED_PUBLIC_IP:-}"
HEALTH_MAX_ATTEMPTS="${PRESSLY_HEALTH_MAX_ATTEMPTS:-30}"
HEALTH_RETRY_DELAY_SECONDS="${PRESSLY_HEALTH_RETRY_DELAY_SECONDS:-2}"
HEALTH_REQUEST_TIMEOUT_SECONDS="${PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS:-10}"
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"
CURRENT_RELEASE_METADATA_FILE="${PRESSLY_CURRENT_RELEASE_METADATA_FILE:-$APP_ROOT/current-release.json}"
PREVIOUS_RELEASE_METADATA_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
DEPLOYMENT_STATE_FILE="${PRESSLY_DEPLOYMENT_STATE_FILE:-$APP_ROOT/deployment-state.json}"
PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-}"
PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-}"
PRESSLY_WORKER_IMAGE="${PRESSLY_WORKER_IMAGE:-}"
PRESSLY_PROCESSOR_IMAGE="${PRESSLY_PROCESSOR_IMAGE:-}"
PRESSLY_CONTROL_IMAGE="${PRESSLY_CONTROL_IMAGE:-}"
TARGET_RELEASE_FORMAT="${PRESSLY_TARGET_RELEASE_FORMAT:-five-image-v1}"
LEGACY_ROLLBACK_MANIFEST_FILE="${PRESSLY_LEGACY_ROLLBACK_MANIFEST_FILE:-}"
deployment_completed=false
deployment_state_tracking_started=false
target_runtime_mutation_started=false
release_snapshot_tmp=""

emit_deployment_event() {
  local outcome="$1"
  local exit_code="$2"
  local occurred_at
  occurred_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

  printf '{"event":"deployment.%s","outcome":"%s","sourceSha":"%s","exitCode":%s,"occurredAt":"%s"}\n' \
    "$outcome" \
    "$outcome" \
    "${DEPLOY_SHA:-unknown}" \
    "$exit_code" \
    "$occurred_at"
}

deployment_state_operation() {
  local action="$1"
  local invocation_mode="$2"
  local phase="$3"
  local outcome="$4"
  local exit_code="$5"

  python3 - \
    "$DEPLOYMENT_STATE_FILE" \
    "$action" \
    "$invocation_mode" \
    "$TARGET_RELEASE_FORMAT" \
    "${DEPLOY_SHA,,}" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" \
    "$PRESSLY_CONTROL_IMAGE" \
    "$phase" \
    "$outcome" \
    "$exit_code" <<'PY'
import datetime
import json
import os
import re
import sys
import tempfile

(
    path,
    action,
    invocation_mode,
    release_format,
    source_sha,
    api_image,
    web_image,
    worker_image,
    processor_image,
    control_image,
    phase,
    outcome,
    raw_exit_code,
) = sys.argv[1:]

sha_pattern = re.compile(r'[0-9a-f]{40}')
image_pattern = re.compile(r'ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}')
timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')
image_fields_by_format = {
    'five-image-v1': (
        'apiImage',
        'webImage',
        'workerImage',
        'processorImage',
        'controlImage',
    ),
    'four-image-v1': (
        'apiImage',
        'webImage',
        'workerImage',
        'processorImage',
    ),
    'legacy-two-image-v1': ('apiImage', 'webImage'),
}
allowed_states = {
    ('attempted', 'in_progress', None),
    ('running_unverified', 'in_progress', None),
    ('running_unverified', 'failed', 'nonzero'),
    ('failed_before_running', 'failed', 'nonzero'),
    ('verified', 'succeeded', 0),
}
common_fields = {
    'schemaVersion',
    'releaseFormat',
    'sourceSha',
    'phase',
    'outcome',
    'exitCode',
    'updatedAt',
}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def load_state():
    try:
        with open(path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError(f'cannot read deployment state: {error}') from error
    if not isinstance(value, dict):
        raise ValueError('deployment state must be a JSON object')
    return value


def state_key(value):
    exit_code = value.get('exitCode')
    if isinstance(exit_code, bool) or (
        exit_code is not None and not isinstance(exit_code, int)
    ):
        raise ValueError('exitCode must be null or an integer')
    if isinstance(exit_code, int) and not 0 <= exit_code <= 255:
        raise ValueError('exitCode must be between 0 and 255')
    if exit_code is not None and exit_code != 0:
        exit_code = 'nonzero'
    return (value.get('phase'), value.get('outcome'), exit_code)


def validate_state(value):
    stored_format = value.get('releaseFormat')
    if stored_format not in image_fields_by_format:
        raise ValueError('releaseFormat is invalid')
    image_fields = image_fields_by_format[stored_format]
    if set(value) != common_fields | set(image_fields):
        raise ValueError('deployment state fields are incomplete or unknown')
    if value.get('schemaVersion') != 1:
        raise ValueError('schemaVersion is invalid')
    if not sha_pattern.fullmatch(value.get('sourceSha', '')):
        raise ValueError('sourceSha is invalid')
    images = [value.get(field, '') for field in image_fields]
    if not all(image_pattern.fullmatch(image) for image in images):
        raise ValueError('every image must be an immutable GHCR digest')
    if len(set(images)) != len(images):
        raise ValueError('image references must be distinct')
    if state_key(value) not in allowed_states:
        raise ValueError('phase, outcome, and exitCode are inconsistent')
    if not timestamp_pattern.fullmatch(value.get('updatedAt', '')):
        raise ValueError('updatedAt is invalid')


def release_identity(value):
    stored_format = value['releaseFormat']
    fields = ('releaseFormat', 'sourceSha', *image_fields_by_format[stored_format])
    return tuple(value[field] for field in fields)


if release_format not in image_fields_by_format:
    raise SystemExit('Deployment state target release format is invalid.')
if not sha_pattern.fullmatch(source_sha):
    raise SystemExit('Deployment state target source SHA is invalid.')

target_images = {
    'apiImage': api_image,
    'webImage': web_image,
    'workerImage': worker_image,
    'processorImage': processor_image,
    'controlImage': control_image,
}
target = {
    'releaseFormat': release_format,
    'sourceSha': source_sha,
    **{
        field: target_images[field]
        for field in image_fields_by_format[release_format]
    },
}
target_image_values = [
    target[field] for field in image_fields_by_format[release_format]
]
if not all(image_pattern.fullmatch(image) for image in target_image_values):
    raise SystemExit('Deployment state target image identity is invalid.')
if len(set(target_image_values)) != len(target_image_values):
    raise SystemExit('Deployment state target images must be distinct.')

if action == 'guard':
    if invocation_mode not in {'normal', 'resume'}:
        raise SystemExit('Deployment state invocation mode is invalid.')
    if not os.path.exists(path):
        if invocation_mode == 'resume':
            raise SystemExit(
                '--resume-unverified requires an existing running_unverified '
                'deployment state.'
            )
        raise SystemExit(0)
    try:
        existing = load_state()
        validate_state(existing)
    except ValueError as error:
        raise SystemExit(f'Deployment state is invalid: {error}.') from error

    if invocation_mode == 'normal':
        if existing['phase'] == 'running_unverified':
            raise SystemExit(
                'Deployment state is running_unverified; use '
                '--resume-unverified with the exact recorded target or '
                'reconcile it before a new deployment.'
            )
        raise SystemExit(0)

    if existing['phase'] != 'running_unverified':
        raise SystemExit(
            '--resume-unverified requires an existing running_unverified '
            'deployment state.'
        )
    if release_identity(existing) != release_identity(target):
        raise SystemExit(
            '--resume-unverified target does not exactly match the recorded '
            'running_unverified release identity.'
        )
    raise SystemExit(0)

if action != 'write':
    raise SystemExit('Deployment state operation is invalid.')

if raw_exit_code == '-':
    parsed_exit_code = None
else:
    try:
        parsed_exit_code = int(raw_exit_code)
    except ValueError as error:
        raise SystemExit('Deployment state exit code is invalid.') from error

updated_at = datetime.datetime.now(datetime.timezone.utc).strftime(
    '%Y-%m-%dT%H:%M:%SZ'
)
state = {
    'schemaVersion': 1,
    **target,
    'phase': phase,
    'outcome': outcome,
    'exitCode': parsed_exit_code,
    'updatedAt': updated_at,
}
try:
    validate_state(state)
except ValueError as error:
    raise SystemExit(f'Deployment state is invalid: {error}.') from error

directory = os.path.dirname(os.path.abspath(path))
prefix = f'.{os.path.basename(path)}.tmp.'
file_descriptor, temporary_path = tempfile.mkstemp(dir=directory, prefix=prefix)
try:
    os.fchmod(file_descriptor, 0o600)
    with os.fdopen(file_descriptor, 'w', encoding='utf-8') as handle:
        json.dump(state, handle, separators=(',', ':'))
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_path, path)
    directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
except BaseException:
    try:
        os.close(file_descriptor)
    except OSError:
        pass
    try:
        os.unlink(temporary_path)
    except FileNotFoundError:
        pass
    raise
PY
}

guard_deployment_state() {
  if [[ "$resume_unverified" == true ]]; then
    deployment_state_operation "guard" "resume" "-" "-" "-"
  else
    deployment_state_operation "guard" "normal" "-" "-" "-"
  fi
}

write_deployment_state() {
  deployment_state_operation "write" "-" "$1" "$2" "$3"
}

preflight_health_hostname() {
  local application="$1"
  local url="$2"
  local hostname

  if ! hostname="$(
    python3 - "$url" <<'PY'
import sys
import urllib.parse

url = sys.argv[1]
try:
    parsed = urllib.parse.urlsplit(url)
    port = parsed.port
except ValueError as error:
    raise SystemExit(f'invalid health URL: {error}') from error

if parsed.scheme.lower() != 'https':
    raise SystemExit('health URL must use HTTPS')
if not parsed.hostname or parsed.username is not None or parsed.password is not None:
    raise SystemExit('health URL must contain an unauthenticated hostname')
if port not in (None, 443):
    raise SystemExit('health URL must use the default HTTPS port')

print(parsed.hostname)
PY
  )"; then
    echo "$application health URL preflight failed: $url" >&2
    return 1
  fi

  local resolved_addresses
  if ! resolved_addresses="$(getent ahostsv4 "$hostname")" || \
    [[ -z "$resolved_addresses" ]]; then
    echo "$application DNS preflight failed for $hostname." >&2
    return 1
  fi

  if [[ -n "$EXPECTED_PUBLIC_IP" ]]; then
    local address
    local expected_address_found=false
    local unexpected_address_found=false
    while read -r address _; do
      if [[ "$address" == "$EXPECTED_PUBLIC_IP" ]]; then
        expected_address_found=true
      else
        unexpected_address_found=true
      fi
    done <<< "$resolved_addresses"
    if [[
      "$expected_address_found" != true ||
      "$unexpected_address_found" == true
    ]]; then
      echo "$application DNS preflight did not resolve $hostname exclusively to the expected production IP." >&2
      return 1
    fi
  fi

  echo "$application DNS preflight passed for $hostname."
}

preflight_health_hostnames() {
  preflight_health_hostname "API" "$API_HEALTH_URL"
  preflight_health_hostname "Web" "$WEB_HEALTH_URL"
  if [[
    "$TARGET_RELEASE_FORMAT" == "five-image-v1" ||
    "$TARGET_RELEASE_FORMAT" == "four-image-v1"
  ]]; then
    preflight_health_hostname "Processor" "$PROCESSOR_HEALTH_URL"
  fi
  if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
    preflight_health_hostname "Control" "$CONTROL_HEALTH_URL"
  fi
}

durably_install_current_release() {
  local release_tmp="$1"
  local release_path="$2"
  local metadata_tmp="$3"
  local metadata_path="$4"

  python3 - \
    "$release_tmp" \
    "$release_path" \
    "$metadata_tmp" \
    "$metadata_path" <<'PY'
import os
import sys

release_tmp, release_path, metadata_tmp, metadata_path = sys.argv[1:]

for path in (release_tmp, metadata_tmp):
    with open(path, 'rb') as handle:
        os.fsync(handle.fileno())

os.replace(release_tmp, release_path)
os.replace(metadata_tmp, metadata_path)

for directory in {
    os.path.dirname(os.path.abspath(release_path)),
    os.path.dirname(os.path.abspath(metadata_path)),
}:
    directory_descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
PY
}

require_positive_integer() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[1-9][0-9]*$ ]]; then
    echo "$name must be a positive integer." >&2
    exit 1
  fi
}

require_non_negative_integer() {
  local name="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[0-9]+$ ]]; then
    echo "$name must be a non-negative integer." >&2
    exit 1
  fi
}

wait_for_health() {
  local application="$1"
  local url="$2"
  local attempt

  for ((attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1)); do
    if curl \
      --fail \
      --silent \
      --show-error \
      --max-time "$HEALTH_REQUEST_TIMEOUT_SECONDS" \
      --output /dev/null \
      "$url"; then
      echo "$application health check passed after $attempt attempt(s)."
      return 0
    fi

    if ((attempt < HEALTH_MAX_ATTEMPTS)); then
      echo "$application health check attempt $attempt/$HEALTH_MAX_ATTEMPTS failed; retrying." >&2
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done

  echo "$application health check failed after $HEALTH_MAX_ATTEMPTS attempts." >&2
  return 1
}

on_exit() {
  local exit_code="$?"

  if [[ -n "$release_snapshot_tmp" ]]; then
    rm -f "$release_snapshot_tmp"
  fi

  if [[
    "$preflight_only" != true &&
    "$deployment_completed" != true &&
    "$exit_code" -ne 0
  ]]; then
    if [[ "$deployment_state_tracking_started" == true ]]; then
      if [[ "$target_runtime_mutation_started" == true ]]; then
        if ! write_deployment_state "running_unverified" "failed" "$exit_code"; then
          echo "Failed to persist the running-but-unverified deployment outcome." >&2
        fi
      elif ! write_deployment_state "failed_before_running" "failed" "$exit_code"; then
        echo "Failed to persist the pre-running deployment outcome." >&2
      fi
    fi
    emit_deployment_event "failed" "$exit_code" >&2
  fi
}

trap on_exit EXIT

require_positive_integer PRESSLY_HEALTH_MAX_ATTEMPTS "$HEALTH_MAX_ATTEMPTS"
require_non_negative_integer \
  PRESSLY_HEALTH_RETRY_DELAY_SECONDS \
  "$HEALTH_RETRY_DELAY_SECONDS"
require_positive_integer \
  PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS \
  "$HEALTH_REQUEST_TIMEOUT_SECONDS"

export PRESSLY_CADDY_ENV_FILE="$CADDY_ENV_FILE"
export PRESSLY_WEB_ENV_FILE="$WEB_ENV_FILE"
export PRESSLY_API_ENV_FILE="$API_ENV_FILE"
export PRESSLY_WORKER_ENV_FILE="$WORKER_ENV_FILE"
export PRESSLY_PROCESSOR_ENV_FILE="$PROCESSOR_ENV_FILE"
export PRESSLY_CONTROL_ENV_FILE="$CONTROL_ENV_FILE"
export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"
export PRESSLY_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE"
export PRESSLY_BACKUP_ENV_FILE="$BACKUP_ENV_FILE"
export PRESSLY_API_IMAGE
export PRESSLY_WEB_IMAGE
export PRESSLY_WORKER_IMAGE
export PRESSLY_PROCESSOR_IMAGE
export PRESSLY_CONTROL_IMAGE
export PRESSLY_RELEASE_SHA="${DEPLOY_SHA,,}"

if [[ ! "$DEPLOY_SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "DEPLOY_SHA must be a full 40-character commit SHA." >&2
    exit 1
fi

image_pattern='^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$'
if [[ ! "$PRESSLY_API_IMAGE" =~ $image_pattern ]]; then
  echo "PRESSLY_API_IMAGE must be an immutable GHCR digest." >&2
  exit 1
fi
if [[ ! "$PRESSLY_WEB_IMAGE" =~ $image_pattern ]]; then
  echo "PRESSLY_WEB_IMAGE must be an immutable GHCR digest." >&2
  exit 1
fi

case "$TARGET_RELEASE_FORMAT" in
  five-image-v1)
    if [[ ! "$PRESSLY_WORKER_IMAGE" =~ $image_pattern ]]; then
      echo "PRESSLY_WORKER_IMAGE must be an immutable GHCR digest." >&2
      exit 1
    fi
    if [[ ! "$PRESSLY_PROCESSOR_IMAGE" =~ $image_pattern ]]; then
      echo "PRESSLY_PROCESSOR_IMAGE must be an immutable GHCR digest." >&2
      exit 1
    fi
    if [[ ! "$PRESSLY_CONTROL_IMAGE" =~ $image_pattern ]]; then
      echo "PRESSLY_CONTROL_IMAGE must be an immutable GHCR digest." >&2
      exit 1
    fi
    if [[ -n "$LEGACY_ROLLBACK_MANIFEST_FILE" ]]; then
      echo "A five-image deploy cannot use a legacy rollback manifest." >&2
      exit 1
    fi
    ;;
  four-image-v1)
    if [[ ! "$PRESSLY_WORKER_IMAGE" =~ $image_pattern ]]; then
      echo "PRESSLY_WORKER_IMAGE must be an immutable GHCR digest." >&2
      exit 1
    fi
    if [[ ! "$PRESSLY_PROCESSOR_IMAGE" =~ $image_pattern ]]; then
      echo "PRESSLY_PROCESSOR_IMAGE must be an immutable GHCR digest." >&2
      exit 1
    fi
    if [[ -n "$PRESSLY_CONTROL_IMAGE" ]]; then
      echo "A four-image rollback cannot include a Control image." >&2
      exit 1
    fi
    if [[ -n "$LEGACY_ROLLBACK_MANIFEST_FILE" ]]; then
      echo "A four-image deploy cannot use a legacy rollback manifest." >&2
      exit 1
    fi
    ;;
  legacy-two-image-v1)
    if [[
      -n "$PRESSLY_WORKER_IMAGE" ||
      -n "$PRESSLY_PROCESSOR_IMAGE" ||
      -n "$PRESSLY_CONTROL_IMAGE"
    ]]; then
      echo "A legacy rollback cannot include Worker, Processor, or Control images." >&2
      exit 1
    fi
    if [[ ! -f "$LEGACY_ROLLBACK_MANIFEST_FILE" ]]; then
      echo "A legacy rollback requires its validated transitional manifest." >&2
      exit 1
    fi
    ;;
  *)
    echo "Unsupported release format: $TARGET_RELEASE_FORMAT" >&2
    exit 1
    ;;
esac

for required_command in git docker curl getent python3 stat mktemp sha256sum; do
  if ! command -v "$required_command" >/dev/null; then
    echo "Missing deployment prerequisite: $required_command" >&2
    exit 1
  fi
done

if [[ -n "$EXPECTED_PUBLIC_IP" ]]; then
  python3 - "$EXPECTED_PUBLIC_IP" <<'PY'
import ipaddress
import sys

try:
    address = ipaddress.ip_address(sys.argv[1])
except ValueError as error:
    raise SystemExit('PRESSLY_EXPECTED_PUBLIC_IP must be an IPv4 address.') from error
if address.version != 4:
    raise SystemExit('PRESSLY_EXPECTED_PUBLIC_IP must be an IPv4 address.')
PY
fi

if ! docker compose version >/dev/null; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [[ "$preflight_only" != true ]]; then
  guard_deployment_state
  if [[ "$resume_unverified" == true ]]; then
    # The exact target was already admitted to runtime mutation by the prior
    # attempt. Any resume failure must retain that truth, even before Compose.
    target_runtime_mutation_started=true
    deployment_state_tracking_started=true
  else
    write_deployment_state "attempted" "in_progress" "-"
    deployment_state_tracking_started=true
  fi
fi

required_env_files=(
  "$COMPOSE_ENV_FILE" \
  "$CADDY_ENV_FILE" \
  "$WEB_ENV_FILE" \
  "$API_ENV_FILE" \
  "$WORKER_ENV_FILE" \
  "$PROCESSOR_ENV_FILE" \
  "$POSTGRES_ENV_FILE" \
  "$MIGRATION_ENV_FILE" \
  "$BACKUP_ENV_FILE"
)
if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
  required_env_files+=("$CONTROL_ENV_FILE")
fi

for env_file in "${required_env_files[@]}"; do
  if [[ ! -f "$env_file" ]]; then
    echo "Missing env file: $env_file" >&2
    exit 1
  fi

  if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
    echo "Invalid env file permissions. Expected 600: $env_file" >&2
    exit 1
  fi
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

# Public DNS is a release prerequisite, not a post-migration discovery. Check
# every hostname that this release format will probe before snapshotting the
# verified release or allowing checkout, migrations, or Compose mutation.
preflight_health_hostnames

# previous-release.json is the authoritative rollback target. Normalize and
# atomically replace it before checkout, migrations, or Compose can mutate the
# running deployment.
snapshot_output="-"
if [[ "$preflight_only" != true ]]; then
  release_snapshot_tmp="$(mktemp "${PREVIOUS_RELEASE_METADATA_FILE}.tmp.XXXXXX")"
  snapshot_output="$release_snapshot_tmp"
fi
python3 - \
  "$CURRENT_RELEASE_FILE" \
  "$CURRENT_RELEASE_METADATA_FILE" \
  "$snapshot_output" \
  "$TARGET_RELEASE_FORMAT" \
  "${DEPLOY_SHA,,}" \
  "$PRESSLY_API_IMAGE" \
  "$PRESSLY_WEB_IMAGE" \
  "$PRESSLY_WORKER_IMAGE" \
  "$PRESSLY_PROCESSOR_IMAGE" \
  "$PRESSLY_CONTROL_IMAGE" \
  "${LEGACY_ROLLBACK_MANIFEST_FILE:--}" <<'PY'
import json
import os
import re
import sys

(
    current_sha_path,
    current_metadata_path,
    snapshot_path,
    target_format,
    target_sha,
    target_api,
    target_web,
    target_worker,
    target_processor,
    target_control,
    legacy_manifest_path,
) = sys.argv[1:]

sha_pattern = re.compile(r'[0-9a-f]{40}')
image_pattern = re.compile(r'ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}')
timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')
four_fields = {
    'releaseFormat',
    'sourceSha',
    'apiImage',
    'webImage',
    'workerImage',
    'processorImage',
    'deployedAt',
}
five_fields = {
    'releaseFormat',
    'sourceSha',
    'apiImage',
    'webImage',
    'workerImage',
    'processorImage',
    'controlImage',
    'deployedAt',
}
legacy_fields = {
    'releaseFormat',
    'transition',
    'sourceSha',
    'apiImage',
    'webImage',
    'deployedAt',
}
unmarked_legacy_fields = {
    'sourceSha',
    'apiImage',
    'webImage',
    'deployedAt',
}


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def load_object(path):
    try:
        with open(path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError(f'cannot read {path}: {error}') from error
    if not isinstance(value, dict):
        raise ValueError('metadata must be a JSON object')
    return value


def validate_common(value):
    if not sha_pattern.fullmatch(value.get('sourceSha', '')):
        raise ValueError('sourceSha must be a lowercase full commit SHA')
    if not timestamp_pattern.fullmatch(value.get('deployedAt', '')):
        raise ValueError('deployedAt must be a UTC second timestamp')


def validate_images(value, fields):
    images = [value.get(field, '') for field in fields]
    if not all(image_pattern.fullmatch(image) for image in images):
        raise ValueError('every release image must be an immutable GHCR digest')
    if len(set(images)) != len(images):
        raise ValueError('release image references must be distinct')


def normalize_current(value):
    if set(value) == five_fields and value.get('releaseFormat') == 'five-image-v1':
        validate_common(value)
        validate_images(
            value,
            ('apiImage', 'webImage', 'workerImage', 'processorImage', 'controlImage'),
        )
        return value

    if set(value) == four_fields and value.get('releaseFormat') == 'four-image-v1':
        validate_common(value)
        validate_images(
            value,
            ('apiImage', 'webImage', 'workerImage', 'processorImage'),
        )
        return value

    if (
        set(value) == legacy_fields
        and value.get('releaseFormat') == 'legacy-two-image-v1'
        and value.get('transition') == 'first-four-image-cutover'
    ):
        validate_common(value)
        validate_images(value, ('apiImage', 'webImage'))
        return value

    # This is the one accepted unmarked shape: metadata written by the old
    # two-image deploy script immediately before the first four-image cutover.
    if set(value) == unmarked_legacy_fields:
        validate_common(value)
        validate_images(value, ('apiImage', 'webImage'))
        return {
            'releaseFormat': 'legacy-two-image-v1',
            'transition': 'first-four-image-cutover',
            **value,
        }

    raise ValueError('metadata is not a complete supported release shape')


def validate_target_manifest():
    if target_format != 'legacy-two-image-v1':
        return
    if legacy_manifest_path == '-':
        raise ValueError('legacy rollback manifest is missing')
    raw_manifest = load_object(legacy_manifest_path)
    if set(raw_manifest) != legacy_fields:
        raise ValueError('legacy rollback manifest is not the transitional shape')
    manifest = normalize_current(raw_manifest)
    expected = (target_sha, target_api, target_web)
    observed = (
        manifest['sourceSha'],
        manifest['apiImage'],
        manifest['webImage'],
    )
    if observed != expected:
        raise ValueError('legacy rollback target does not match its manifest')


def validate_target_identity():
    if not sha_pattern.fullmatch(target_sha):
        raise ValueError('target source SHA is invalid')
    if target_format == 'five-image-v1':
        validate_images(
            {
                'apiImage': target_api,
                'webImage': target_web,
                'workerImage': target_worker,
                'processorImage': target_processor,
                'controlImage': target_control,
            },
            ('apiImage', 'webImage', 'workerImage', 'processorImage', 'controlImage'),
        )
    elif target_format == 'four-image-v1':
        validate_images(
            {
                'apiImage': target_api,
                'webImage': target_web,
                'workerImage': target_worker,
                'processorImage': target_processor,
            },
            ('apiImage', 'webImage', 'workerImage', 'processorImage'),
        )


def target_identity():
    if target_format == 'five-image-v1':
        return (
            target_format,
            target_sha,
            target_api,
            target_web,
            target_worker,
            target_processor,
            target_control,
        )
    if target_format == 'four-image-v1':
        return (
            target_format,
            target_sha,
            target_api,
            target_web,
            target_worker,
            target_processor,
        )
    return (target_format, target_sha, target_api, target_web)


def current_identity(value):
    if value['releaseFormat'] == 'five-image-v1':
        return (
            value['releaseFormat'],
            value['sourceSha'],
            value['apiImage'],
            value['webImage'],
            value['workerImage'],
            value['processorImage'],
            value['controlImage'],
        )
    if value['releaseFormat'] == 'four-image-v1':
        return (
            value['releaseFormat'],
            value['sourceSha'],
            value['apiImage'],
            value['webImage'],
            value['workerImage'],
            value['processorImage'],
        )
    return (
        value['releaseFormat'],
        value['sourceSha'],
        value['apiImage'],
        value['webImage'],
    )


try:
    validate_target_identity()
    validate_target_manifest()
    current_sha_exists = os.path.isfile(current_sha_path)
    current_metadata_exists = os.path.isfile(current_metadata_path)
    if current_sha_exists and not current_metadata_exists:
        raise ValueError(
            'current release metadata is missing for the derived SHA pointer'
        )

    if current_metadata_exists:
        current = normalize_current(load_object(current_metadata_path))
        if (
            current['sourceSha'] == target_sha
            and current_identity(current) != target_identity()
        ):
            raise ValueError('the source SHA is already associated with a different release')
        if current['sourceSha'] != target_sha and snapshot_path != '-':
            with open(snapshot_path, 'w', encoding='utf-8') as handle:
                json.dump(current, handle, separators=(',', ':'))
                handle.write('\n')
except ValueError as error:
    raise SystemExit(f'Release metadata preflight failed: {error}.')
PY

if [[ "$preflight_only" == true ]]; then
  cd "$REPO_DIR"
  git cat-file -e "$DEPLOY_SHA^{commit}"
  preflight_sha="$(git rev-parse --verify "$DEPLOY_SHA^{commit}")"
  if [[ "$preflight_sha" != "${DEPLOY_SHA,,}" ]]; then
    echo "Resolved commit $preflight_sha does not match requested commit $DEPLOY_SHA." >&2
    exit 1
  fi
  docker compose \
    --profile tools \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    config --quiet
  echo "Deployment preflight passed for source SHA: ${DEPLOY_SHA,,}"
  exit 0
fi

if [[ -s "$release_snapshot_tmp" ]]; then
  snapshot_sha="$(
    python3 -c \
      'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["sourceSha"])' \
      "$release_snapshot_tmp"
  )"
  mv "$release_snapshot_tmp" "$PREVIOUS_RELEASE_METADATA_FILE"
  release_snapshot_tmp=""

  previous_release_tmp="$(mktemp "${PREVIOUS_RELEASE_FILE}.tmp.XXXXXX")"
  printf '%s\n' "$snapshot_sha" > "$previous_release_tmp"
  mv "$previous_release_tmp" "$PREVIOUS_RELEASE_FILE"
else
  rm -f "$release_snapshot_tmp"
  release_snapshot_tmp=""
fi

cd "$REPO_DIR"

git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
git cat-file -e "$DEPLOY_SHA^{commit}"
git checkout --detach "$DEPLOY_SHA"

target_sha="$(git rev-parse --verify HEAD)"
if [[ "$target_sha" != "${DEPLOY_SHA,,}" ]]; then
  echo "Resolved commit $target_sha does not match requested commit $DEPLOY_SHA." >&2
  exit 1
fi

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  config --quiet

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  pull

verify_image_revision() {
  local application="$1"
  local image="$2"
  local revision

  revision="$(
    docker image inspect \
      --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
      "$image"
  )"
  if [[ "$revision" != "$target_sha" ]]; then
    echo "$application image revision label is '$revision'; expected $target_sha." >&2
    exit 1
  fi
}

verify_image_revision "API" "$PRESSLY_API_IMAGE"
verify_image_revision "Web" "$PRESSLY_WEB_IMAGE"
if [[
  "$TARGET_RELEASE_FORMAT" == "five-image-v1" ||
  "$TARGET_RELEASE_FORMAT" == "four-image-v1"
]]; then
  verify_image_revision "Worker" "$PRESSLY_WORKER_IMAGE"
  verify_image_revision "Processor" "$PRESSLY_PROCESSOR_IMAGE"
fi
if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
  verify_image_revision "Control" "$PRESSLY_CONTROL_IMAGE"
fi

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm --workdir /repo/packages/db migrate \
  node node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts

write_deployment_state "running_unverified" "in_progress" "-"
target_runtime_mutation_started=true

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans --wait

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps

wait_for_health "API" "$API_HEALTH_URL"
wait_for_health "Web" "$WEB_HEALTH_URL"
if [[
  "$TARGET_RELEASE_FORMAT" == "five-image-v1" ||
  "$TARGET_RELEASE_FORMAT" == "four-image-v1"
]]; then
  wait_for_health "Processor" "$PROCESSOR_HEALTH_URL"
fi
if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
  wait_for_health "Control" "$CONTROL_HEALTH_URL"
fi

deployed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
current_release_tmp="$(mktemp "${CURRENT_RELEASE_FILE}.tmp.XXXXXX")"
current_metadata_tmp="$(mktemp "${CURRENT_RELEASE_METADATA_FILE}.tmp.XXXXXX")"
printf '%s\n' "$target_sha" > "$current_release_tmp"
if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
  printf '{"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","deployedAt":"%s"}\n' \
    "$target_sha" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" \
    "$PRESSLY_CONTROL_IMAGE" \
    "$deployed_at" > "$current_metadata_tmp"
elif [[ "$TARGET_RELEASE_FORMAT" == "four-image-v1" ]]; then
  printf '{"releaseFormat":"four-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","deployedAt":"%s"}\n' \
    "$target_sha" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" \
    "$deployed_at" > "$current_metadata_tmp"
else
  printf '{"releaseFormat":"legacy-two-image-v1","transition":"first-four-image-cutover","sourceSha":"%s","apiImage":"%s","webImage":"%s","deployedAt":"%s"}\n' \
    "$target_sha" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$deployed_at" > "$current_metadata_tmp"
fi
durably_install_current_release \
  "$current_release_tmp" \
  "$CURRENT_RELEASE_FILE" \
  "$current_metadata_tmp" \
  "$CURRENT_RELEASE_METADATA_FILE"

write_deployment_state "verified" "succeeded" "0"
deployment_completed=true

echo "Deployed source SHA: $target_sha"
echo "API image: $PRESSLY_API_IMAGE"
echo "Web image: $PRESSLY_WEB_IMAGE"
if [[
  "$TARGET_RELEASE_FORMAT" == "five-image-v1" ||
  "$TARGET_RELEASE_FORMAT" == "four-image-v1"
]]; then
  echo "Worker image: $PRESSLY_WORKER_IMAGE"
  echo "Processor image: $PRESSLY_PROCESSOR_IMAGE"
fi
if [[ "$TARGET_RELEASE_FORMAT" == "five-image-v1" ]]; then
  echo "Control image: $PRESSLY_CONTROL_IMAGE"
elif [[ "$TARGET_RELEASE_FORMAT" == "legacy-two-image-v1" ]]; then
  echo "Release format: transitional legacy two-image rollback"
fi
echo "Deployment time: $deployed_at"
emit_deployment_event "succeeded" 0
