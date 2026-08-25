#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
ROLLBACK_SELF_STAGED_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_FILE:-}"
ROLLBACK_SELF_STAGED_TOOLING_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_TOOLING_FILE:-}"
ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE:-}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ -n "${PRESSLY_DEPLOY_TOOLING_FILE:-}" ]]; then
  DEPLOY_TOOLING_FILE="$PRESSLY_DEPLOY_TOOLING_FILE"
elif [[ -f "$SCRIPT_DIR/deployment-tooling.mjs" ]]; then
  DEPLOY_TOOLING_FILE="$SCRIPT_DIR/deployment-tooling.mjs"
else
  DEPLOY_TOOLING_FILE="$REPO_DIR/deploy/aws/lightsail/deployment-tooling.mjs"
fi
if [[ -n "${PRESSLY_TOOLING_ERROR_FACTORY_PATH:-}" ]]; then
  PRESSLY_TOOLING_ERROR_FACTORY_PATH="$PRESSLY_TOOLING_ERROR_FACTORY_PATH"
elif [[ -f "$SCRIPT_DIR/../../../platform/errors/src/tooling-error.mjs" ]]; then
  PRESSLY_TOOLING_ERROR_FACTORY_PATH="$SCRIPT_DIR/../../../platform/errors/src/tooling-error.mjs"
else
  PRESSLY_TOOLING_ERROR_FACTORY_PATH="$REPO_DIR/platform/errors/src/tooling-error.mjs"
fi
export DEPLOY_TOOLING_FILE PRESSLY_TOOLING_ERROR_FACTORY_PATH
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
  DEPLOY_SCRIPT="$APP_ROOT/repo/deploy/aws/lightsail/deploy.sh"
fi
rollback_manifest_copy=""

cleanup() {
  if [[ -n "$rollback_manifest_copy" ]]; then
    rm -f "$rollback_manifest_copy"
  fi
  if [[ -n "$ROLLBACK_SELF_STAGED_FILE" ]]; then
    rm -f "$ROLLBACK_SELF_STAGED_FILE"
  fi
  if [[ -n "$ROLLBACK_SELF_STAGED_TOOLING_FILE" ]]; then
    rm -f "$ROLLBACK_SELF_STAGED_TOOLING_FILE"
  fi
  if [[ -n "$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE" ]]; then
    rm -f "$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE"
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
  ROLLBACK_SELF_STAGED_TOOLING_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.rollback-tooling.XXXXXX.mjs")"
  ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.rollback-error.XXXXXX.mjs")"
  cp "$0" "$ROLLBACK_SELF_STAGED_FILE"
  cp "$DEPLOY_TOOLING_FILE" "$ROLLBACK_SELF_STAGED_TOOLING_FILE"
  cp "$PRESSLY_TOOLING_ERROR_FACTORY_PATH" "$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE"
  chmod 700 \
    "$ROLLBACK_SELF_STAGED_FILE" \
    "$ROLLBACK_SELF_STAGED_TOOLING_FILE" \
    "$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE"
  export \
    PRESSLY_ROLLBACK_SELF_STAGED_FILE="$ROLLBACK_SELF_STAGED_FILE" \
    PRESSLY_ROLLBACK_SELF_STAGED_TOOLING_FILE="$ROLLBACK_SELF_STAGED_TOOLING_FILE" \
    PRESSLY_ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE="$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE" \
    PRESSLY_DEPLOY_TOOLING_FILE="$ROLLBACK_SELF_STAGED_TOOLING_FILE" \
    PRESSLY_TOOLING_ERROR_FACTORY_PATH="$ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE"
  exec "$ROLLBACK_SELF_STAGED_FILE" "$@"
fi

if [[ ! -f "$PREVIOUS_RELEASE_FILE" && ! -f "$DEPLOYMENT_STATE_FILE" ]]; then
  echo "Missing previous release file: $PREVIOUS_RELEASE_FILE" >&2
  exit 1
fi

command -v node >/dev/null || {
  echo "node is required to validate the previous release manifest." >&2
  exit 1
}
for required_tooling_file in \
  "$DEPLOY_TOOLING_FILE" \
  "$PRESSLY_TOOLING_ERROR_FACTORY_PATH"; do
  if [[ ! -f "$required_tooling_file" ]]; then
    echo "Missing rollback tooling file: $required_tooling_file" >&2
    exit 1
  fi
done

release_output="$(
  node "$DEPLOY_TOOLING_FILE" rollback-release \
    "$PREVIOUS_RELEASE_FILE" \
    "$DEPLOYMENT_STATE_FILE"
)"
mapfile -t release <<< "$release_output"

# Preserve the exact validated rollback identity before deploy.sh can rotate
# previous-release.json. The explicit --rollback admission mode binds every
# rollback, including unresolved-deployment reconciliation, to this copy.
rollback_manifest_copy="$(mktemp "${PREVIOUS_RELEASE_FILE}.rollback.XXXXXX")"
printf '%s\n' "${release[0]}" > "$rollback_manifest_copy"

DEPLOY_SHA="${release[1]}" \
PRESSLY_API_IMAGE="${release[2]}" \
PRESSLY_WEB_IMAGE="${release[3]}" \
PRESSLY_WORKER_IMAGE="${release[4]}" \
PRESSLY_PROCESSOR_IMAGE="${release[5]}" \
PRESSLY_CONTROL_IMAGE="${release[6]}" \
PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE="$rollback_manifest_copy" \
  "$DEPLOY_SCRIPT" --rollback
