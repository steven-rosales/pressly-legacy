#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
ROLLBACK_SELF_STAGED_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_FILE:-}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
DEPLOYMENT_STATE_FILE="${PRESSLY_DEPLOYMENT_STATE_FILE:-$APP_ROOT/deployment-state.json}"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
if [[ -n "${PRESSLY_DEPLOY_SCRIPT:-}" ]]; then
  DEPLOY_SCRIPT="$PRESSLY_DEPLOY_SCRIPT"
elif [[ -x "$OPS_ROOT/current/deploy.sh" ]]; then
  DEPLOY_SCRIPT="$OPS_ROOT/current/deploy.sh"
elif [[ -x "$OPS_ROOT/candidate/deploy.sh" ]]; then
  DEPLOY_SCRIPT="$OPS_ROOT/candidate/deploy.sh"
else
  DEPLOY_SCRIPT="$APP_ROOT/repo/infra/aws/lightsail/deploy.sh"
fi
rollback_manifest_copy=""

cleanup() {
  if [[ -n "$rollback_manifest_copy" ]]; then
    rm -f "$rollback_manifest_copy"
  fi
  if [[ -n "$ROLLBACK_SELF_STAGED_FILE" ]]; then
    rm -f "$ROLLBACK_SELF_STAGED_FILE"
  fi
}

trap cleanup EXIT

command -v flock >/dev/null || {
  echo "flock is required to serialize deployment recovery." >&2
  exit 1
}
if [[ "${PRESSLY_DEPLOY_LOCK_HELD:-}" == "1" ]]; then
  if ! flock -n 9; then
    echo "Inherited deployment lock is invalid." >&2
    exit 1
  fi
else
  exec 9> "$DEPLOY_LOCK_FILE"
  if ! flock -n 9; then
    echo "Another deployment or rollback is already in progress." >&2
    exit 75
  fi
  export PRESSLY_DEPLOY_LOCK_HELD=1
fi

if [[ -e "$RESTORE_JOURNAL_FILE" || -L "$RESTORE_JOURNAL_FILE" ]]; then
  echo "Active Postgres restore journal blocks rollback: $RESTORE_JOURNAL_FILE" >&2
  exit 75
fi

if [[ -z "$ROLLBACK_SELF_STAGED_FILE" ]]; then
  ROLLBACK_SELF_STAGED_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.rollback.XXXXXX")"
  cp "$0" "$ROLLBACK_SELF_STAGED_FILE"
  chmod 700 "$ROLLBACK_SELF_STAGED_FILE"
  export PRESSLY_ROLLBACK_SELF_STAGED_FILE="$ROLLBACK_SELF_STAGED_FILE"
  exec "$ROLLBACK_SELF_STAGED_FILE" "$@"
fi

if [[ ! -f "$PREVIOUS_RELEASE_FILE" && ! -f "$DEPLOYMENT_STATE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

command -v python3 >/dev/null || {
  echo "python3 is required to validate the previous release manifest." >&2
  exit 1
}

release_output="$(
  python3 - "$PREVIOUS_RELEASE_FILE" "$DEPLOYMENT_STATE_FILE" <<'PY'
import json
import os
import re
import sys

def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


def load_object(path, description):
    try:
        with open(path, encoding='utf-8') as handle:
            value = json.load(handle, object_pairs_hook=unique_object)
    except (OSError, ValueError) as error:
        raise SystemExit(f'{description} is invalid: {error}.')
    if not isinstance(value, dict):
        raise SystemExit(f'{description} is invalid.')
    return value


previous_path, state_path = sys.argv[1:]
release = None
if os.path.isfile(state_path):
    deployment_state = load_object(state_path, 'Deployment state')
    if deployment_state.get('schemaVersion') == 2:
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
        if (
            set(deployment_state) != recovery_fields
            or deployment_state.get('phase') != 'recovering_unverified'
            or deployment_state.get('outcome') not in {'in_progress', 'failed'}
        ):
            raise SystemExit('Deployment recovery state is invalid.')
        release = deployment_state.get('recoveryTarget')

if release is None:
    release = load_object(previous_path, 'Previous release manifest')

if not isinstance(release, dict):
    raise SystemExit('Previous release manifest is invalid.')

sha = release.get('sourceSha', '')
api = release.get('apiImage', '')
web = release.get('webImage', '')
worker = release.get('workerImage', '')
processor = release.get('processorImage', '')
control = release.get('controlImage', '')
deployed_at = release.get('deployedAt', '')
release_format = release.get('releaseFormat', '')
image = re.compile(
    r'^(ghcr\.io/[a-z0-9._/-]+)@sha256:([0-9a-f]{64})$'
)
timestamp = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')
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

def valid_images(values):
    repositories = set()
    digests = set()
    for application, value in values:
        match = image.fullmatch(value)
        if match is None:
            return False
        repository, digest = match.groups()
        repository_name = repository.rsplit('/', 1)[-1]
        if repository_name not in {application, f'pressly-{application}'}:
            return False
        repositories.add(repository)
        digests.add(digest)
    return len(repositories) == len(values) and len(digests) == len(values)


common_valid = (
    re.fullmatch(r'[0-9a-f]{40}', sha)
    and timestamp.fullmatch(deployed_at)
)
four_valid = (
    release_format == 'four-image-v1'
    and set(release) == four_fields
    and common_valid
    and valid_images(
        (('api', api), ('web', web), ('worker', worker), ('processor', processor))
    )
)
five_valid = (
    release_format == 'five-image-v1'
    and set(release) == five_fields
    and common_valid
    and valid_images(
        (
            ('api', api),
            ('web', web),
            ('worker', worker),
            ('processor', processor),
            ('control', control),
        )
    )
)
legacy_valid = (
    release_format == 'legacy-two-image-v1'
    and set(release) == legacy_fields
    and release.get('transition') == 'first-four-image-cutover'
    and common_valid
    and valid_images((('api', api), ('web', web)))
)

if not five_valid and not four_valid and not legacy_valid:
    raise SystemExit('Previous release manifest is invalid.')

print(json.dumps(release, separators=(',', ':')))
print(release_format)
print(sha)
print(api)
print(web)
if five_valid or four_valid:
    print(worker)
    print(processor)
if five_valid:
    print(control)
PY
)"
mapfile -t release <<< "$release_output"

# Preserve the exact validated rollback identity before deploy.sh can rotate
# previous-release.json. The explicit --rollback admission mode binds every
# rollback, including unresolved-deployment reconciliation, to this copy.
rollback_manifest_copy="$(mktemp "${PREVIOUS_RELEASE_FILE}.rollback.XXXXXX")"
printf '%s\n' "${release[0]}" > "$rollback_manifest_copy"

case "${release[1]}" in
  five-image-v1)
    DEPLOY_SHA="${release[2]}" \
    PRESSLY_API_IMAGE="${release[3]}" \
    PRESSLY_WEB_IMAGE="${release[4]}" \
    PRESSLY_WORKER_IMAGE="${release[5]}" \
    PRESSLY_PROCESSOR_IMAGE="${release[6]}" \
    PRESSLY_CONTROL_IMAGE="${release[7]}" \
    PRESSLY_TARGET_RELEASE_FORMAT="five-image-v1" \
    PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE="$rollback_manifest_copy" \
      "$DEPLOY_SCRIPT" --rollback
    ;;
  four-image-v1)
    DEPLOY_SHA="${release[2]}" \
    PRESSLY_API_IMAGE="${release[3]}" \
    PRESSLY_WEB_IMAGE="${release[4]}" \
    PRESSLY_WORKER_IMAGE="${release[5]}" \
    PRESSLY_PROCESSOR_IMAGE="${release[6]}" \
    PRESSLY_CONTROL_IMAGE="" \
    PRESSLY_TARGET_RELEASE_FORMAT="four-image-v1" \
    PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE="$rollback_manifest_copy" \
      "$DEPLOY_SCRIPT" --rollback
    ;;
  legacy-two-image-v1)
    # deploy.sh snapshots the currently running four-image release before it
    # checks out the legacy commit. Preserve the validated target separately so
    # that snapshot cannot replace the manifest being executed.
    DEPLOY_SHA="${release[2]}" \
    PRESSLY_API_IMAGE="${release[3]}" \
    PRESSLY_WEB_IMAGE="${release[4]}" \
    PRESSLY_WORKER_IMAGE="" \
    PRESSLY_PROCESSOR_IMAGE="" \
    PRESSLY_CONTROL_IMAGE="" \
    PRESSLY_TARGET_RELEASE_FORMAT="legacy-two-image-v1" \
    PRESSLY_LEGACY_ROLLBACK_MANIFEST_FILE="$rollback_manifest_copy" \
    PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE="$rollback_manifest_copy" \
      "$DEPLOY_SCRIPT" --rollback
    ;;
  *)
    echo "Previous release manifest is invalid." >&2
    exit 1
    ;;
esac
