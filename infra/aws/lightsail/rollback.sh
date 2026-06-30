#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
DEPLOY_SCRIPT="${PRESSLY_DEPLOY_SCRIPT:-$APP_ROOT/repo/infra/aws/lightsail/deploy.sh}"

if [[ ! -f "$PREVIOUS_RELEASE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

command -v python3 >/dev/null || {
  echo "python3 is required to validate the previous release manifest." >&2
  exit 1
}

mapfile -t release < <(
  python3 - "$PREVIOUS_RELEASE_FILE" <<'PY'
import json
import re
import sys

with open(sys.argv[1], encoding='utf-8') as handle:
    release = json.load(handle)

sha = release.get('sourceSha', '')
api = release.get('apiImage', '')
web = release.get('webImage', '')
image = re.compile(r'^ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}$')
if not re.fullmatch(r'[0-9a-f]{40}', sha) or not image.fullmatch(api) or not image.fullmatch(web):
    raise SystemExit('Previous release manifest is invalid.')

print(sha)
print(api)
print(web)
PY
)

DEPLOY_SHA="${release[0]}" \
PRESSLY_API_IMAGE="${release[1]}" \
PRESSLY_WEB_IMAGE="${release[2]}" \
  "$DEPLOY_SCRIPT"
