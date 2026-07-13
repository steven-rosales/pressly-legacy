#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
DEPLOY_SCRIPT="${PRESSLY_DEPLOY_SCRIPT:-$APP_ROOT/repo/infra/aws/lightsail/deploy.sh}"
legacy_manifest_copy=""

cleanup() {
  if [[ -n "$legacy_manifest_copy" ]]; then
    rm -f "$legacy_manifest_copy"
  fi
}

trap cleanup EXIT

if [[ ! -f "$PREVIOUS_RELEASE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

command -v python3 >/dev/null || {
  echo "python3 is required to validate the previous release manifest." >&2
  exit 1
}

release_output="$(
  python3 - "$PREVIOUS_RELEASE_FILE" <<'PY'
import json
import re
import sys

def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError(f'duplicate field {key!r}')
        value[key] = item
    return value


try:
    with open(sys.argv[1], encoding='utf-8') as handle:
        release = json.load(handle, object_pairs_hook=unique_object)
except (OSError, ValueError) as error:
    raise SystemExit(f'Previous release manifest is invalid: {error}.')

if not isinstance(release, dict):
    raise SystemExit('Previous release manifest is invalid.')

sha = release.get('sourceSha', '')
api = release.get('apiImage', '')
web = release.get('webImage', '')
worker = release.get('workerImage', '')
processor = release.get('processorImage', '')
deployed_at = release.get('deployedAt', '')
release_format = release.get('releaseFormat', '')
image = re.compile(r'^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$')
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
legacy_fields = {
    'releaseFormat',
    'transition',
    'sourceSha',
    'apiImage',
    'webImage',
    'deployedAt',
}

common_valid = (
    re.fullmatch(r'[0-9a-f]{40}', sha)
    and image.fullmatch(api)
    and image.fullmatch(web)
    and api != web
    and timestamp.fullmatch(deployed_at)
)
four_valid = (
    release_format == 'four-image-v1'
    and set(release) == four_fields
    and common_valid
    and image.fullmatch(worker)
    and image.fullmatch(processor)
    and len({api, web, worker, processor}) == 4
)
legacy_valid = (
    release_format == 'legacy-two-image-v1'
    and set(release) == legacy_fields
    and release.get('transition') == 'first-four-image-cutover'
    and common_valid
)

if not four_valid and not legacy_valid:
    raise SystemExit('Previous release manifest is invalid.')

print(release_format)
print(sha)
print(api)
print(web)
if four_valid:
    print(worker)
    print(processor)
PY
)"
mapfile -t release <<< "$release_output"

case "${release[0]}" in
  four-image-v1)
    DEPLOY_SHA="${release[1]}" \
    PRESSLY_API_IMAGE="${release[2]}" \
    PRESSLY_WEB_IMAGE="${release[3]}" \
    PRESSLY_WORKER_IMAGE="${release[4]}" \
    PRESSLY_PROCESSOR_IMAGE="${release[5]}" \
    PRESSLY_TARGET_RELEASE_FORMAT="four-image-v1" \
      "$DEPLOY_SCRIPT"
    ;;
  legacy-two-image-v1)
    # deploy.sh snapshots the currently running four-image release before it
    # checks out the legacy commit. Preserve the validated target separately so
    # that snapshot cannot replace the manifest being executed.
    legacy_manifest_copy="$(mktemp "${PREVIOUS_RELEASE_FILE}.legacy.XXXXXX")"
    cp "$PREVIOUS_RELEASE_FILE" "$legacy_manifest_copy"
    DEPLOY_SHA="${release[1]}" \
    PRESSLY_API_IMAGE="${release[2]}" \
    PRESSLY_WEB_IMAGE="${release[3]}" \
    PRESSLY_WORKER_IMAGE="" \
    PRESSLY_PROCESSOR_IMAGE="" \
    PRESSLY_TARGET_RELEASE_FORMAT="legacy-two-image-v1" \
    PRESSLY_LEGACY_ROLLBACK_MANIFEST_FILE="$legacy_manifest_copy" \
      "$DEPLOY_SCRIPT"
    ;;
  *)
    echo "Previous release manifest is invalid." >&2
    exit 1
    ;;
esac
