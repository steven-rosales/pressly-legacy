#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"
DEPLOY_SCRIPT="${PRESSLY_DEPLOY_SCRIPT:-$APP_ROOT/repo/infra/aws/lightsail/deploy.sh}"

if [[ ! -f "$PREVIOUS_RELEASE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

previous_sha="$(cat "$PREVIOUS_RELEASE_FILE")"

case "$previous_sha" in
  "" | *[!a-fA-F0-9]*)
    echo "Invalid previous release SHA: $previous_sha" >&2
    exit 1
    ;;
esac

DEPLOY_REF="$previous_sha" "$DEPLOY_SCRIPT"
