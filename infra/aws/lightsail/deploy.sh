#!/usr/bin/env bash
set -euo pipefail

preflight_only=false
resume_unverified=false
rollback_release=false
case "${1:-}" in
  '') ;;
  --preflight-only) preflight_only=true ;;
  --resume-unverified) resume_unverified=true ;;
  --rollback) rollback_release=true ;;
  *)
    echo "Usage: deploy.sh [--preflight-only|--resume-unverified|--rollback]" >&2
    exit 2
    ;;
esac

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
DEPLOY_SELF_STAGED_FILE="${PRESSLY_DEPLOY_SELF_STAGED_FILE:-}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
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
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-}"
PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-}"
PRESSLY_WORKER_IMAGE="${PRESSLY_WORKER_IMAGE:-}"
PRESSLY_PROCESSOR_IMAGE="${PRESSLY_PROCESSOR_IMAGE:-}"
PRESSLY_CONTROL_IMAGE="${PRESSLY_CONTROL_IMAGE:-}"
TARGET_RELEASE_FORMAT="${PRESSLY_TARGET_RELEASE_FORMAT:-five-image-v1}"
LEGACY_ROLLBACK_MANIFEST_FILE="${PRESSLY_LEGACY_ROLLBACK_MANIFEST_FILE:-}"
ROLLBACK_RELEASE_MANIFEST_FILE="${PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE:-}"
deployment_completed=false
deployment_state_tracking_started=false
target_runtime_mutation_started=false
unverified_reconciliation_pending=false
recovery_in_progress=false
release_snapshot_tmp=""
previous_release_pointer_tmp=""
invocation_checkout_sha=""
target_checkout_started=false

acquire_deployment_lock() {
  if ! command -v flock >/dev/null; then
    echo "Missing deployment prerequisite: flock" >&2
    exit 1
  fi

  if [[ "${PRESSLY_DEPLOY_LOCK_HELD:-}" == "1" ]]; then
    if ! flock -n 9; then
      echo "Inherited deployment lock is invalid." >&2
      exit 1
    fi
    return
  fi

  exec 9> "$DEPLOY_LOCK_FILE"
  if ! flock -n 9; then
    echo "Another deployment or rollback is already in progress." >&2
    exit 75
  fi
  export PRESSLY_DEPLOY_LOCK_HELD=1
}

refuse_active_restore() {
  if [[ -e "$RESTORE_JOURNAL_FILE" || -L "$RESTORE_JOURNAL_FILE" ]]; then
    echo "Active Postgres restore journal blocks deployment: $RESTORE_JOURNAL_FILE" >&2
    exit 75
  fi
}

stage_deployment_script() {
  if [[ -n "$DEPLOY_SELF_STAGED_FILE" ]]; then
    return
  fi

  DEPLOY_SELF_STAGED_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.deploy.XXXXXX")"
  cp "$0" "$DEPLOY_SELF_STAGED_FILE"
  chmod 700 "$DEPLOY_SELF_STAGED_FILE"
  export PRESSLY_DEPLOY_SELF_STAGED_FILE="$DEPLOY_SELF_STAGED_FILE"
  exec "$DEPLOY_SELF_STAGED_FILE" "$@"
}

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
    "${ROLLBACK_RELEASE_MANIFEST_FILE:--}" \
    "$CURRENT_RELEASE_METADATA_FILE" \
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
    rollback_manifest_path,
    current_metadata_path,
    phase,
    outcome,
    raw_exit_code,
) = sys.argv[1:]

sha_pattern = re.compile(r'[0-9a-f]{40}')
image_pattern = re.compile(
    r'(ghcr\.io/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})'
)
timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')
image_application_by_field = {
    'apiImage': 'api',
    'webImage': 'web',
    'workerImage': 'worker',
    'processorImage': 'processor',
    'controlImage': 'control',
}
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
allowed_standard_states = {
    ('attempted', 'in_progress', None),
    ('running_unverified', 'in_progress', None),
    ('running_unverified', 'failed', 'nonzero'),
    ('failed_before_running', 'failed', 'nonzero'),
    ('verified', 'succeeded', 0),
}
allowed_recovery_states = {
    ('recovering_unverified', 'in_progress', None),
    ('recovering_unverified', 'failed', 'nonzero'),
}
standard_common_fields = {
    'schemaVersion',
    'releaseFormat',
    'sourceSha',
    'phase',
    'outcome',
    'exitCode',
    'updatedAt',
}
recovery_fields = {
    'schemaVersion',
    'phase',
    'outcome',
    'exitCode',
    'updatedAt',
    'unresolvedRelease',
    'recoveryTarget',
    'rollbackPrevious',
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


def validate_release_identity(value, description):
    if not isinstance(value, dict):
        raise ValueError(f'{description} must be a JSON object')
    stored_format = value.get('releaseFormat')
    if stored_format not in image_fields_by_format:
        raise ValueError(f'{description} releaseFormat is invalid')
    image_fields = image_fields_by_format[stored_format]
    expected_fields = {'releaseFormat', 'sourceSha', *image_fields}
    if set(value) != expected_fields:
        raise ValueError(f'{description} fields are incomplete or unknown')
    if not sha_pattern.fullmatch(value.get('sourceSha', '')):
        raise ValueError(f'{description} sourceSha is invalid')

    repositories = set()
    digests = set()
    for field in image_fields:
        match = image_pattern.fullmatch(value.get(field, ''))
        if match is None:
            raise ValueError(
                f'{description} {field} must be an immutable GHCR digest'
            )
        repository, digest = match.groups()
        application = image_application_by_field[field]
        repository_name = repository.rsplit('/', 1)[-1]
        if repository_name not in {application, f'pressly-{application}'}:
            raise ValueError(
                f'{description} {field} repository does not match {application}'
            )
        repositories.add(repository)
        digests.add(digest)
    if len(repositories) != len(image_fields):
        raise ValueError(f'{description} image repositories must be distinct')
    if len(digests) != len(image_fields):
        raise ValueError(f'{description} image digests must be distinct')


def identity_object(value):
    stored_format = value['releaseFormat']
    return {
        'releaseFormat': stored_format,
        'sourceSha': value['sourceSha'],
        **{
            field: value[field]
            for field in image_fields_by_format[stored_format]
        },
    }


def validate_release_record(value, description):
    if not isinstance(value, dict):
        raise ValueError(f'{description} must be a JSON object')
    stored_format = value.get('releaseFormat')
    if stored_format not in image_fields_by_format:
        raise ValueError(f'{description} releaseFormat is invalid')
    expected_fields = {
        'releaseFormat',
        'sourceSha',
        *image_fields_by_format[stored_format],
        'deployedAt',
    }
    if stored_format == 'legacy-two-image-v1':
        expected_fields.add('transition')
        if value.get('transition') != 'first-four-image-cutover':
            raise ValueError(f'{description} legacy transition is invalid')
    if set(value) != expected_fields:
        raise ValueError(f'{description} fields are incomplete or unknown')
    validate_release_identity(identity_object(value), description)
    if not timestamp_pattern.fullmatch(value.get('deployedAt', '')):
        raise ValueError(f'{description} deployedAt is invalid')


def load_current_release_record():
    current = load_object(current_metadata_path, 'current release metadata')
    unmarked_legacy_fields = {
        'sourceSha',
        'apiImage',
        'webImage',
        'deployedAt',
    }
    if set(current) == unmarked_legacy_fields:
        current = {
            'releaseFormat': 'legacy-two-image-v1',
            'transition': 'first-four-image-cutover',
            **current,
        }
    validate_release_record(current, 'current release metadata')
    return current


def validate_state(value):
    schema_version = value.get('schemaVersion')
    if schema_version == 1:
        stored_format = value.get('releaseFormat')
        if stored_format not in image_fields_by_format:
            raise ValueError('releaseFormat is invalid')
        image_fields = image_fields_by_format[stored_format]
        if set(value) != standard_common_fields | set(image_fields):
            raise ValueError('deployment state fields are incomplete or unknown')
        validate_release_identity(identity_object(value), 'deployment state')
        if state_key(value) not in allowed_standard_states:
            raise ValueError('phase, outcome, and exitCode are inconsistent')
        if not timestamp_pattern.fullmatch(value.get('updatedAt', '')):
            raise ValueError('updatedAt is invalid')
        return 'standard'

    if schema_version == 2:
        if set(value) != recovery_fields:
            raise ValueError('recovery state fields are incomplete or unknown')
        validate_release_identity(
            value.get('unresolvedRelease'), 'unresolved release'
        )
        validate_release_record(value.get('recoveryTarget'), 'recovery target')
        if release_identity(value['unresolvedRelease']) == release_identity(
            value['recoveryTarget']
        ):
            raise ValueError('recovery identities must be distinct')
        rollback_previous = value.get('rollbackPrevious')
        if rollback_previous is not None:
            validate_release_record(rollback_previous, 'rollback previous release')
            if release_identity(rollback_previous) == release_identity(
                value['recoveryTarget']
            ):
                raise ValueError(
                    'rollback previous release must differ from recovery target'
                )
        if state_key(value) not in allowed_recovery_states:
            raise ValueError(
                'recovery phase, outcome, and exitCode are inconsistent'
            )
        if not timestamp_pattern.fullmatch(value.get('updatedAt', '')):
            raise ValueError('updatedAt is invalid')
        return 'recovery'

    raise ValueError('schemaVersion is invalid')


def release_identity(value):
    stored_format = value['releaseFormat']
    fields = ('releaseFormat', 'sourceSha', *image_fields_by_format[stored_format])
    return tuple(value[field] for field in fields)


def load_rollback_record():
    if rollback_manifest_path == '-':
        raise ValueError('rollback release manifest is missing')
    rollback = load_object(rollback_manifest_path, 'rollback release manifest')
    stored_format = rollback.get('releaseFormat')
    if stored_format not in image_fields_by_format:
        raise ValueError('rollback release format is invalid')

    image_fields = image_fields_by_format[stored_format]
    expected_fields = {
        'releaseFormat',
        'sourceSha',
        *image_fields,
        'deployedAt',
    }
    if stored_format == 'legacy-two-image-v1':
        expected_fields.add('transition')
        if rollback.get('transition') != 'first-four-image-cutover':
            raise ValueError('legacy rollback transition is invalid')
    if set(rollback) != expected_fields:
        raise ValueError('rollback release fields are incomplete or unknown')
    rollback_identity = identity_object(rollback)
    validate_release_identity(rollback_identity, 'rollback release')
    if not timestamp_pattern.fullmatch(rollback.get('deployedAt', '')):
        raise ValueError('rollback deployedAt is invalid')
    return rollback


def load_rollback_identity():
    return release_identity(load_rollback_record())


def load_object(object_path, description):
    try:
        with open(object_path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise ValueError(f'cannot read {description}: {error}') from error
    if not isinstance(value, dict):
        raise ValueError(f'{description} must be a JSON object')
    return value


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
try:
    validate_release_identity(target, 'deployment target')
except ValueError as error:
    raise SystemExit(f'Deployment state target is invalid: {error}.') from error

if action == 'guard':
    if invocation_mode not in {'normal', 'resume', 'rollback'}:
        raise SystemExit('Deployment state invocation mode is invalid.')
    if invocation_mode == 'rollback':
        try:
            rollback_identity = load_rollback_identity()
        except ValueError as error:
            raise SystemExit(f'Rollback admission failed: {error}.') from error
        if rollback_identity != release_identity(target):
            raise SystemExit(
                'Rollback target does not exactly match the admitted release manifest.'
            )
    if not os.path.exists(path):
        if invocation_mode == 'resume':
            raise SystemExit(
                '--resume-unverified requires an existing running_unverified '
                'deployment state.'
            )
        if invocation_mode == 'rollback':
            print('reconcile')
        raise SystemExit(0)
    try:
        existing = load_state()
        existing_kind = validate_state(existing)
    except ValueError as error:
        raise SystemExit(f'Deployment state is invalid: {error}.') from error

    if invocation_mode == 'normal':
        if existing_kind == 'recovery':
            raise SystemExit(
                'Deployment recovery is unresolved; retry rollback with the '
                'exact recorded recovery target.'
            )
        if existing['phase'] == 'running_unverified':
            raise SystemExit(
                'Deployment state is running_unverified; use '
                '--resume-unverified with the exact recorded target or '
                'reconcile it before a new deployment.'
            )
        raise SystemExit(0)

    if invocation_mode == 'rollback':
        if existing_kind == 'recovery':
            if release_identity(existing['recoveryTarget']) != release_identity(
                target
            ):
                raise SystemExit(
                    'Rollback target does not exactly match the recorded '
                    'recovery target.'
                )
            print('recover')
            raise SystemExit(0)
        print('reconcile')
        raise SystemExit(0)

    if existing_kind == 'recovery':
        raise SystemExit(
            '--resume-unverified cannot erase an unresolved rollback recovery; '
            'retry rollback with the exact recorded recovery target.'
        )
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

if action not in {'write', 'start_recovery', 'write_recovery'}:
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
if action == 'write':
    state = {
        'schemaVersion': 1,
        **target,
        'phase': phase,
        'outcome': outcome,
        'exitCode': parsed_exit_code,
        'updatedAt': updated_at,
    }
else:
    existing = None
    existing_kind = None
    if os.path.exists(path):
        try:
            existing = load_state()
            existing_kind = validate_state(existing)
        except ValueError as error:
            raise SystemExit(f'Deployment state is invalid: {error}.') from error

    if action == 'start_recovery':
        if existing_kind == 'recovery':
            unresolved_release = existing['unresolvedRelease']
            recovery_target = existing['recoveryTarget']
            rollback_previous = existing['rollbackPrevious']
            if release_identity(existing['recoveryTarget']) != release_identity(
                target
            ):
                raise SystemExit(
                    'Recovery target does not exactly match the recorded target.'
                )
        else:
            try:
                recovery_target = load_rollback_record()
            except ValueError as error:
                raise SystemExit(f'Rollback admission failed: {error}.') from error
            if release_identity(recovery_target) != release_identity(target):
                raise SystemExit(
                    'Recovery target does not match the admitted rollback manifest.'
                )
            try:
                current_release = load_current_release_record()
            except ValueError as error:
                raise SystemExit(
                    f'Current release metadata is invalid: {error}.'
                ) from error
            current_identity = identity_object(current_release)
            if (
                existing_kind == 'standard'
                and existing['phase'] == 'running_unverified'
                and release_identity(existing) != release_identity(target)
            ):
                unresolved_release = identity_object(existing)
            else:
                unresolved_release = current_identity
            rollback_previous = (
                current_release
                if release_identity(current_identity) != release_identity(target)
                else None
            )
    else:
        if existing_kind != 'recovery':
            raise SystemExit('No rollback recovery is currently in progress.')
        if release_identity(existing['recoveryTarget']) != release_identity(target):
            raise SystemExit(
                'Recovery target does not exactly match the recorded target.'
            )
        unresolved_release = existing['unresolvedRelease']
        recovery_target = existing['recoveryTarget']
        rollback_previous = existing['rollbackPrevious']

    state = {
        'schemaVersion': 2,
        'phase': phase,
        'outcome': outcome,
        'exitCode': parsed_exit_code,
        'updatedAt': updated_at,
        'unresolvedRelease': unresolved_release,
        'recoveryTarget': recovery_target,
        'rollbackPrevious': rollback_previous,
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
  elif [[ "$rollback_release" == true ]]; then
    local rollback_admission
    rollback_admission="$(
      deployment_state_operation "guard" "rollback" "-" "-" "-"
    )"
    if [[
      "$rollback_admission" == "reconcile" ||
      "$rollback_admission" == "recover"
    ]]; then
      unverified_reconciliation_pending=true
    elif [[ "$rollback_admission" != "normal" ]]; then
      echo "Deployment rollback admission returned an invalid result." >&2
      return 1
    fi
  else
    deployment_state_operation "guard" "normal" "-" "-" "-"
  fi
}

write_deployment_state() {
  deployment_state_operation "write" "-" "$1" "$2" "$3"
}

start_recovery_state() {
  deployment_state_operation "start_recovery" "-" \
    "recovering_unverified" "in_progress" "-"
}

write_failed_recovery_state() {
  deployment_state_operation "write_recovery" "-" \
    "recovering_unverified" "failed" "$1"
}

restore_invocation_checkout() {
  if [[
    "$preflight_only" == true ||
    "$deployment_completed" == true ||
    "$target_checkout_started" != true ||
    -z "$invocation_checkout_sha"
  ]]; then
    return
  fi

  if ! (
    cd "$REPO_DIR"
    git checkout --detach "$invocation_checkout_sha"
  ); then
    echo "Failed to restore invocation checkout $invocation_checkout_sha." >&2
  fi
}

health_hostname() {
  python3 - "$1" <<'PY'
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
}

preflight_health_hostname() {
  local application="$1"
  local url="$2"
  local hostname

  if ! hostname="$(health_hostname "$url")"; then
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

durably_install_release_pair() {
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

install_ops_bundle() {
  local source_sha="$1"
  local link_name="$2"

  python3 - \
    "$REPO_DIR/infra/aws/lightsail" \
    "$OPS_ROOT" \
    "$source_sha" \
    "$link_name" <<'PY'
import hashlib
import os
import shutil
import stat
import sys
import tempfile

source_directory, ops_root, source_sha, link_name = sys.argv[1:]
script_names = (
    'deploy.sh',
    'rollback.sh',
    'backup-postgres.sh',
    'check-host-capacity.sh',
    'configure-database-roles.sh',
    'restore-postgres-drill.sh',
    'restore-postgres.sh',
    'run-monitored-operation.sh',
)
# restore-postgres-proof.sh is deliberately excluded. It is a disposable,
# repository-layout proof harness, not a production host-control entrypoint.
if link_name not in {'candidate', 'current'}:
    raise SystemExit('Operations bundle link name is invalid.')


def fsync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def digest(path):
    value = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


def wrapper(name):
    deploy_binding = (
        'export PRESSLY_DEPLOY_SCRIPT="$bundle_dir/deploy.sh"\n'
        if name == 'rollback.sh'
        else ''
    )
    return f'''#!/usr/bin/env bash
set -euo pipefail

bundle_dir="$(CDPATH= cd -- "$(dirname -- "${{BASH_SOURCE[0]}}")" && pwd -P)"
if ! (cd "$bundle_dir" && sha256sum --check --strict --status SHA256SUMS); then
  echo "Operations bundle checksum verification failed: $bundle_dir" >&2
  exit 70
fi
{deploy_binding}exec "$bundle_dir/payload/{name}" "$@"
'''.encode()


sources = {}
for name in script_names:
    path = os.path.join(source_directory, name)
    if not os.path.exists(path):
        raise SystemExit(f'Operations bundle source is missing: {path}')
    mode = os.lstat(path).st_mode
    if not stat.S_ISREG(mode):
        raise SystemExit(f'Operations bundle source must be a regular file: {path}')
    sources[name] = path

wrappers = {name: wrapper(name) for name in script_names}
source_marker = f'{source_sha}\n'.encode()
manifest = (
    ''.join(
        f'{digest_bytes(wrappers[name])}  {name}\n'
        f'{digest(source_path)}  payload/{name}\n'
        for name, source_path in sources.items()
    )
    + f'{digest_bytes(source_marker)}  source-sha\n'
).encode()

os.makedirs(ops_root, mode=0o700, exist_ok=True)
releases_directory = os.path.join(ops_root, 'releases')
os.makedirs(releases_directory, mode=0o700, exist_ok=True)
release_directory = os.path.join(releases_directory, source_sha)
temporary_directory = None

try:
    if os.path.lexists(release_directory):
        if not os.path.isdir(release_directory) or os.path.islink(release_directory):
            raise ValueError('existing operations release is not a directory')
        marker_path = os.path.join(release_directory, 'source-sha')
        try:
            with open(marker_path, encoding='utf-8') as handle:
                installed_sha = handle.read().strip()
        except OSError as error:
            raise ValueError('existing operations release marker is unreadable') from error
        if installed_sha != source_sha:
            raise ValueError('existing operations release marker does not match')
        for name, source_path in sources.items():
            installed_path = os.path.join(release_directory, 'payload', name)
            wrapper_path = os.path.join(release_directory, name)
            if (
                not os.path.exists(installed_path)
                or not stat.S_ISREG(os.lstat(installed_path).st_mode)
                or digest(installed_path) != digest(source_path)
                or not os.path.exists(wrapper_path)
                or not stat.S_ISREG(os.lstat(wrapper_path).st_mode)
                or digest(wrapper_path) != digest_bytes(wrappers[name])
            ):
                raise ValueError(f'existing operations release differs at {name}')
        manifest_path = os.path.join(release_directory, 'SHA256SUMS')
        try:
            with open(manifest_path, 'rb') as handle:
                installed_manifest = handle.read()
        except OSError as error:
            raise ValueError('existing operations checksum manifest is unreadable') from error
        if installed_manifest != manifest:
            raise ValueError('existing operations checksum manifest differs')
    else:
        temporary_directory = tempfile.mkdtemp(
            dir=releases_directory,
            prefix=f'.{source_sha}.',
        )
        payload_directory = os.path.join(temporary_directory, 'payload')
        os.mkdir(payload_directory, mode=0o700)
        for name, source_path in sources.items():
            installed_path = os.path.join(payload_directory, name)
            with open(source_path, 'rb') as source_handle:
                with open(installed_path, 'xb') as installed_handle:
                    shutil.copyfileobj(source_handle, installed_handle)
                    os.fchmod(installed_handle.fileno(), 0o700)
                    installed_handle.flush()
                    os.fsync(installed_handle.fileno())

            wrapper_path = os.path.join(temporary_directory, name)
            with open(wrapper_path, 'xb') as wrapper_handle:
                wrapper_handle.write(wrappers[name])
                os.fchmod(wrapper_handle.fileno(), 0o700)
                wrapper_handle.flush()
                os.fsync(wrapper_handle.fileno())

        manifest_path = os.path.join(temporary_directory, 'SHA256SUMS')
        with open(manifest_path, 'xb') as manifest_handle:
            manifest_handle.write(manifest)
            os.fchmod(manifest_handle.fileno(), 0o600)
            manifest_handle.flush()
            os.fsync(manifest_handle.fileno())

        marker_path = os.path.join(temporary_directory, 'source-sha')
        with open(marker_path, 'xb') as marker:
            marker.write(source_marker)
            os.fchmod(marker.fileno(), 0o600)
            marker.flush()
            os.fsync(marker.fileno())
        fsync_directory(payload_directory)
        fsync_directory(temporary_directory)
        os.replace(temporary_directory, release_directory)
        temporary_directory = None
        fsync_directory(releases_directory)

    descriptor, temporary_link = tempfile.mkstemp(
        dir=ops_root,
        prefix='.current.',
    )
    os.close(descriptor)
    os.unlink(temporary_link)
    try:
        os.symlink(os.path.join('releases', source_sha), temporary_link)
        os.replace(temporary_link, os.path.join(ops_root, link_name))
    finally:
        try:
            os.unlink(temporary_link)
        except FileNotFoundError:
            pass
    fsync_directory(ops_root)
except (OSError, ValueError) as error:
    raise SystemExit(f'Operations bundle installation failed: {error}.') from error
finally:
    if temporary_directory is not None:
        shutil.rmtree(temporary_directory, ignore_errors=True)
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
  local hostname
  local http_status

  hostname="$(health_hostname "$url")" || {
    echo "$application health URL is invalid: $url" >&2
    return 1
  }

  for ((attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1)); do
    http_status=""
    if http_status="$(
      curl \
        --silent \
        --show-error \
        --max-time "$HEALTH_REQUEST_TIMEOUT_SECONDS" \
        --output /dev/null \
        --write-out '%{http_code}' \
        --resolve "$hostname:443:$EXPECTED_PUBLIC_IP" \
        "$url"
    )" && [[ "$http_status" =~ ^2[0-9]{2}$ ]]; then
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
  if [[ -n "$previous_release_pointer_tmp" ]]; then
    rm -f "$previous_release_pointer_tmp"
  fi
  if [[ -n "$DEPLOY_SELF_STAGED_FILE" ]]; then
    rm -f "$DEPLOY_SELF_STAGED_FILE"
  fi

  if [[
    "$preflight_only" != true &&
    "$deployment_completed" != true &&
    "$exit_code" -ne 0
  ]]; then
    if [[ "$deployment_state_tracking_started" == true ]]; then
      if [[ "$recovery_in_progress" == true ]]; then
        if ! write_failed_recovery_state "$exit_code"; then
          echo "Failed to persist the rollback recovery outcome." >&2
        fi
      elif [[ "$target_runtime_mutation_started" == true ]]; then
        if ! write_deployment_state "running_unverified" "failed" "$exit_code"; then
          echo "Failed to persist the running-but-unverified deployment outcome." >&2
        fi
      elif ! write_deployment_state "failed_before_running" "failed" "$exit_code"; then
        echo "Failed to persist the pre-running deployment outcome." >&2
      fi
    fi
    emit_deployment_event "failed" "$exit_code" >&2
  fi

  restore_invocation_checkout
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

for required_command in git docker curl getent python3 stat mktemp sha256sum flock; do
  if ! command -v "$required_command" >/dev/null; then
    echo "Missing deployment prerequisite: $required_command" >&2
    exit 1
  fi
done

acquire_deployment_lock
refuse_active_restore
stage_deployment_script "$@"

if [[ -z "$EXPECTED_PUBLIC_IP" ]]; then
  echo "PRESSLY_EXPECTED_PUBLIC_IP is required for deployment and rollback." >&2
  exit 1
fi
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

if ! docker compose version >/dev/null; then
  echo "Docker Compose v2 is required." >&2
  exit 1
fi

if [[ "$preflight_only" != true ]]; then
  cd "$REPO_DIR"
  invocation_checkout_sha="$(git rev-parse --verify HEAD)"
  if [[ ! "$invocation_checkout_sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "Invocation checkout is not a full commit SHA." >&2
    exit 1
  fi
  if [[ -n "$(
    git status \
      --porcelain=v1 \
      --untracked-files=all \
      --ignored=matching
  )" ]]; then
    echo "Deployment repository must be clean before checkout." >&2
    exit 1
  fi
fi

if [[ "$preflight_only" != true ]]; then
  guard_deployment_state
  if [[ "$resume_unverified" == true ]]; then
    # The exact target was already admitted to runtime mutation by the prior
    # attempt. Any resume failure must retain that truth, even before Compose.
    target_runtime_mutation_started=true
    deployment_state_tracking_started=true
  elif [[ "$unverified_reconciliation_pending" == true ]]; then
    # Journal both immutable identities before rollback preflight. No normal
    # deployment or same-release resume can erase this ambiguity; only the
    # exact recovery target may retry it.
    start_recovery_state
    recovery_in_progress=true
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

# Capture the verified current release before checkout. A normal deployment
# durably installs it as the rollback target before mutation. A rollback keeps
# its admitted target in previous-release.json until the rollback passes every
# health check, retaining the captured current release only in private staging.
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
  "$DEPLOYMENT_STATE_FILE" \
  "$rollback_release" \
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
    deployment_state_path,
    rollback_mode,
    legacy_manifest_path,
) = sys.argv[1:]

sha_pattern = re.compile(r'[0-9a-f]{40}')
image_pattern = re.compile(
    r'(ghcr\.io/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})'
)
timestamp_pattern = re.compile(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z')
image_application_by_field = {
    'apiImage': 'api',
    'webImage': 'web',
    'workerImage': 'worker',
    'processorImage': 'processor',
    'controlImage': 'control',
}
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
    repositories = set()
    digests = set()
    for field in fields:
        match = image_pattern.fullmatch(value.get(field, ''))
        if match is None:
            raise ValueError('every release image must be an immutable GHCR digest')
        repository, digest = match.groups()
        application = image_application_by_field[field]
        repository_name = repository.rsplit('/', 1)[-1]
        if repository_name not in {application, f'pressly-{application}'}:
            raise ValueError(
                f'{field} repository does not match application {application}'
            )
        repositories.add(repository)
        digests.add(digest)
    if len(repositories) != len(fields):
        raise ValueError('release image repositories must be distinct')
    if len(digests) != len(fields):
        raise ValueError('release image digests must be distinct')


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
        snapshot_release = (
            current if current_identity(current) != target_identity() else None
        )
        if rollback_mode == 'true':
            recovery_state = load_object(deployment_state_path)
            expected_recovery_fields = {
                'schemaVersion',
                'phase',
                'outcome',
                'exitCode',
                'updatedAt',
                'unresolvedRelease',
                'recoveryTarget',
                'rollbackPrevious',
            }
            if (
                set(recovery_state) != expected_recovery_fields
                or recovery_state.get('schemaVersion') != 2
                or recovery_state.get('phase') != 'recovering_unverified'
                or current_identity(recovery_state['recoveryTarget'])
                != target_identity()
            ):
                raise ValueError('rollback recovery journal is invalid')
            rollback_previous = recovery_state['rollbackPrevious']
            snapshot_release = (
                normalize_current(rollback_previous)
                if rollback_previous is not None
                else None
            )
            if (
                snapshot_release is not None
                and current_identity(snapshot_release) == target_identity()
            ):
                raise ValueError('rollback recovery previous release is the target')
        if snapshot_release is not None and snapshot_path != '-':
            with open(snapshot_path, 'w', encoding='utf-8') as handle:
                json.dump(snapshot_release, handle, separators=(',', ':'))
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
  previous_release_pointer_tmp="$(mktemp "${PREVIOUS_RELEASE_FILE}.tmp.XXXXXX")"
  printf '%s\n' "$snapshot_sha" > "$previous_release_pointer_tmp"
  if [[ "$rollback_release" != true ]]; then
    durably_install_release_pair \
      "$previous_release_pointer_tmp" \
      "$PREVIOUS_RELEASE_FILE" \
      "$release_snapshot_tmp" \
      "$PREVIOUS_RELEASE_METADATA_FILE"
    previous_release_pointer_tmp=""
    release_snapshot_tmp=""
  fi
else
  rm -f "$release_snapshot_tmp"
  release_snapshot_tmp=""
fi

cd "$REPO_DIR"

git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
git cat-file -e "$DEPLOY_SHA^{commit}"
target_checkout_started=true
git checkout --detach "$DEPLOY_SHA"

target_sha="$(git rev-parse --verify HEAD)"
if [[ "$target_sha" != "${DEPLOY_SHA,,}" ]]; then
  echo "Resolved commit $target_sha does not match requested commit $DEPLOY_SHA." >&2
  exit 1
fi
if [[ -n "$(
  git status \
    --porcelain=v1 \
    --untracked-files=all \
    --ignored=matching
)" ]]; then
  echo "Target deployment checkout must be clean." >&2
  exit 1
fi

# Make this exact, checksummed control-plane revision discoverable before the
# first database or runtime mutation. It is only a recovery candidate here;
# the stable current pointer advances after the normal release verifies.
if [[ "$rollback_release" != true ]]; then
  install_ops_bundle "$target_sha" "candidate"
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

# Migration is the first potentially durable target mutation. Persist the
# conservative state before invoking it so any partial or unknown migration
# outcome blocks unrelated releases and remains eligible for exact recovery.
if [[ "$recovery_in_progress" != true ]]; then
  write_deployment_state "running_unverified" "in_progress" "-"
fi
target_runtime_mutation_started=true
deployment_state_tracking_started=true

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm --workdir /repo/packages/db migrate \
  node node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans --wait

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps

# DNS may change during checkout, migration, or container replacement. Recheck
# immediately before the pinned health probes so another host cannot satisfy
# the public routing prerequisite.
preflight_health_hostnames

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

# The probes above deliberately pin TLS to this host. Confirm live DNS still
# routes every public surface here before release metadata or verified state
# can become authoritative.
preflight_health_hostnames

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
durably_install_release_pair \
  "$current_release_tmp" \
  "$CURRENT_RELEASE_FILE" \
  "$current_metadata_tmp" \
  "$CURRENT_RELEASE_METADATA_FILE"

if [[
  "$rollback_release" == true &&
  -n "$release_snapshot_tmp" &&
  -s "$release_snapshot_tmp"
]]; then
  durably_install_release_pair \
    "$previous_release_pointer_tmp" \
    "$PREVIOUS_RELEASE_FILE" \
    "$release_snapshot_tmp" \
    "$PREVIOUS_RELEASE_METADATA_FILE"
  previous_release_pointer_tmp=""
  release_snapshot_tmp=""
fi

# The application checkout is intentionally allowed to move backward during a
# rollback. Keep recovery tooling on a separately installed control plane:
# successful normal releases advance it, while rollback can never downgrade it.
if [[ "$rollback_release" != true ]]; then
  install_ops_bundle "$target_sha" "current"
fi

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
