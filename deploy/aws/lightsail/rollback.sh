#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
INHERITED_DEPLOY_LOCK="${PRESSLY_DEPLOY_LOCK_HELD:-}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
ROLLBACK_SELF_STAGED_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_FILE:-}"
ROLLBACK_SELF_STAGED_TOOLING_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_TOOLING_FILE:-}"
ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE="${PRESSLY_ROLLBACK_SELF_STAGED_ERROR_FACTORY_FILE:-}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$APP_ROOT/env/compose.env}"
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
CLEAN_EPOCH_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch.json}"
CLEAN_EPOCH_EVIDENCE_FILE="${PRESSLY_CLEAN_EPOCH_EVIDENCE_FILE:-$APP_ROOT/postgres-clean-epoch-last.json}"
CLEAN_EPOCH_RECOVERY="${PRESSLY_CLEAN_EPOCH_RECOVERY:-false}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_SHA="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_SHA:-}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_API_IMAGE="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_API_IMAGE:-}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WEB_IMAGE="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WEB_IMAGE:-}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WORKER_IMAGE="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WORKER_IMAGE:-}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_PROCESSOR_IMAGE="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_PROCESSOR_IMAGE:-}"
CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_CONTROL_IMAGE="${PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_CONTROL_IMAGE:-}"
CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch-deploy-bypass}"
CLEAN_EPOCH_RECOVERY_COMPOSE_FILE="${PRESSLY_CLEAN_EPOCH_RECOVERY_COMPOSE_FILE:-}"
CLEAN_EPOCH_RECOVERY_COMPOSE_OVERRIDE_FILE="${PRESSLY_CLEAN_EPOCH_RECOVERY_COMPOSE_OVERRIDE_FILE:-}"
CLEAN_EPOCH_RECOVERY_FENCE_FILE="${PRESSLY_CLEAN_EPOCH_RECOVERY_FENCE_FILE:-}"
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
case "$CLEAN_EPOCH_RECOVERY" in
  true|false) ;;
  *)
    echo 'PRESSLY_CLEAN_EPOCH_RECOVERY must be exactly true or false.' >&2
    exit 2
    ;;
esac
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
if [[ -e "$CLEAN_EPOCH_JOURNAL_FILE" || -L "$CLEAN_EPOCH_JOURNAL_FILE" ]]; then
  if [[ "$CLEAN_EPOCH_RECOVERY" != true ]]; then
    echo "Active clean-epoch journal blocks application-only rollback: $CLEAN_EPOCH_JOURNAL_FILE" >&2
    exit 75
  fi
  if [[ "$INHERITED_DEPLOY_LOCK" != 1 ]]; then
    echo 'Clean-epoch rollback recovery requires an inherited deployment lock.' >&2
    exit 75
  fi
  if [[ ! "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo 'Clean-epoch rollback recovery requires an exact legacy release SHA.' >&2
    exit 2
  fi
  if [[
    "$CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE" != "$APP_ROOT/postgres-clean-epoch-deploy-bypass" ||
    -e "$CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE" ||
    -L "$CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE"
  ]]; then
    echo 'Clean-epoch deploy journal bypass path is invalid or occupied.' >&2
    exit 75
  fi
elif [[ "$CLEAN_EPOCH_RECOVERY" == true ]]; then
  echo 'Clean-epoch rollback recovery requires an active cutover journal.' >&2
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

if [[
  "$CLEAN_EPOCH_RECOVERY" == true &&
  (
    "${release[1]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_SHA" ||
    "${release[2]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_API_IMAGE" ||
    "${release[3]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WEB_IMAGE" ||
    "${release[4]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WORKER_IMAGE" ||
    "${release[5]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_PROCESSOR_IMAGE" ||
    "${release[6]}" != "$CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_CONTROL_IMAGE"
  )
]]; then
  echo 'Clean-epoch rollback target does not match the exact journaled legacy release identity.' >&2
  exit 75
fi

if [[ "$CLEAN_EPOCH_RECOVERY" == true ]]; then
  journal_legacy_bindings=(
    "$(node "$DEPLOY_TOOLING_FILE" json-file-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseSha)"
    "$(node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseIdentity apiImage)"
    "$(node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseIdentity webImage)"
    "$(node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseIdentity workerImage)"
    "$(node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseIdentity processorImage)"
    "$(node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$CLEAN_EPOCH_JOURNAL_FILE" legacyReleaseIdentity controlImage)"
  )
  for index in {0..5}; do
    if [[ "${journal_legacy_bindings[$index]}" != "${release[$((index + 1))]}" ]]; then
      echo 'Clean-epoch rollback release differs from the active journal identity.' >&2
      exit 75
    fi
  done
fi

if [[ -f "$CLEAN_EPOCH_EVIDENCE_FILE" && ! -L "$CLEAN_EPOCH_EVIDENCE_FILE" ]]; then
  clean_epoch_evidence_phase="$(
    node "$DEPLOY_TOOLING_FILE" json-file-field \
      "$CLEAN_EPOCH_EVIDENCE_FILE" phase
  )"
  clean_epoch_legacy_sha="$(
    node "$DEPLOY_TOOLING_FILE" json-file-field \
      "$CLEAN_EPOCH_EVIDENCE_FILE" legacyReleaseSha
  )"
  if [[
    "$clean_epoch_evidence_phase" == public_verified &&
    "$CLEAN_EPOCH_RECOVERY" != true &&
    "${release[1]}" == "$clean_epoch_legacy_sha"
  ]]; then
    echo 'Application-only rollback across the clean database epoch is forbidden.' >&2
    echo 'Restore the retained legacy database and legacy release as one reviewed recovery.' >&2
    exit 75
  fi
fi

# Preserve the exact validated rollback identity before deploy.sh can rotate
# previous-release.json. The explicit --rollback admission mode binds every
# rollback, including unresolved-deployment reconciliation, to this copy.
rollback_manifest_copy="$(mktemp "${PREVIOUS_RELEASE_FILE}.rollback.XXXXXX")"
printf '%s\n' "${release[0]}" > "$rollback_manifest_copy"

clean_epoch_recovery_switch() {
  for command in docker git stat; do
    command -v "$command" >/dev/null || {
      echo "Missing clean-epoch rollback prerequisite: $command" >&2
      exit 1
    }
  done
  for file in \
    "$COMPOSE_ENV_FILE" \
    "$CLEAN_EPOCH_RECOVERY_COMPOSE_FILE" \
    "$CLEAN_EPOCH_RECOVERY_COMPOSE_OVERRIDE_FILE" \
    "$CLEAN_EPOCH_RECOVERY_FENCE_FILE"; do
    if [[ ! -f "$file" || -L "$file" ]]; then
      echo "Missing regular clean-epoch rollback file: $file" >&2
      exit 1
    fi
  done
  if [[ "$(stat -c '%a' "$COMPOSE_ENV_FILE")" != 600 ]]; then
    echo "Invalid Compose environment permissions: $COMPOSE_ENV_FILE" >&2
    exit 1
  fi
  if [[ "$(stat -c '%a' "$CLEAN_EPOCH_RECOVERY_FENCE_FILE")" != 600 ]]; then
    echo "Invalid clean-epoch recovery fence permissions: $CLEAN_EPOCH_RECOVERY_FENCE_FILE" >&2
    exit 1
  fi

  cd "$REPO_DIR"
  if [[ -n "$(git status --porcelain=v1 --untracked-files=all --ignored=matching)" ]]; then
    echo 'Clean-epoch rollback repository must be clean before checkout.' >&2
    exit 1
  fi
  git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
  git cat-file -e "${release[1]}^{commit}"
  git checkout --detach "${release[1]}"
  if [[ "$(git rev-parse --verify HEAD)" != "${release[1]}" ]]; then
    echo 'Clean-epoch rollback checkout does not match the exact legacy release.' >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain=v1 --untracked-files=all --ignored=matching)" ]]; then
    echo 'Clean-epoch rollback target checkout is not clean.' >&2
    exit 1
  fi

  recovery_compose=(
    env
    "PRESSLY_RELEASE_SHA=${release[1]}"
    "PRESSLY_API_IMAGE=${release[2]}"
    "PRESSLY_WEB_IMAGE=${release[3]}"
    "PRESSLY_WORKER_IMAGE=${release[4]}"
    "PRESSLY_PROCESSOR_IMAGE=${release[5]}"
    "PRESSLY_CONTROL_IMAGE=${release[6]}"
    docker compose
    --env-file "$COMPOSE_ENV_FILE"
    -f "$CLEAN_EPOCH_RECOVERY_COMPOSE_FILE"
    -f "$CLEAN_EPOCH_RECOVERY_COMPOSE_OVERRIDE_FILE"
    -f "$CLEAN_EPOCH_RECOVERY_FENCE_FILE"
  )
  "${recovery_compose[@]}" config --quiet
  "${recovery_compose[@]}" --profile tools pull

  for binding in \
    "API ${release[2]}" \
    "Web ${release[3]}" \
    "Worker ${release[4]}" \
    "Processor ${release[5]}" \
    "Control ${release[6]}"; do
    read -r application image <<< "$binding"
    revision="$(
      docker image inspect \
        --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
        "$image"
    )"
    if [[ "$revision" != "${release[1]}" ]]; then
      echo "$application legacy image revision is '$revision'; expected ${release[1]}." >&2
      exit 1
    fi
  done

  "${recovery_compose[@]}" up -d --remove-orphans --wait
  "${recovery_compose[@]}" ps
  echo "Clean-epoch legacy runtime selected: ${release[1]}"
}

if [[ "$CLEAN_EPOCH_RECOVERY" == true ]]; then
  clean_epoch_recovery_switch
  exit 0
fi

deploy_environment=(
  env
  "DEPLOY_SHA=${release[1]}"
  "PRESSLY_API_IMAGE=${release[2]}"
  "PRESSLY_WEB_IMAGE=${release[3]}"
  "PRESSLY_WORKER_IMAGE=${release[4]}"
  "PRESSLY_PROCESSOR_IMAGE=${release[5]}"
  "PRESSLY_CONTROL_IMAGE=${release[6]}"
  "PRESSLY_ROLLBACK_RELEASE_MANIFEST_FILE=$rollback_manifest_copy"
)
if [[ "$CLEAN_EPOCH_RECOVERY" == true ]]; then
  deploy_environment+=(
    "PRESSLY_CLEAN_EPOCH_JOURNAL_FILE=$CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE"
  )
fi
"${deploy_environment[@]}" "$DEPLOY_SCRIPT" --rollback
