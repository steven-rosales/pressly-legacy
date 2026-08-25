#!/usr/bin/env bash
set -euo pipefail

preflight_only=false
resume_unverified=false
rollback_release=false
clean_epoch_cutover=false
clean_epoch_resume_admission=''
for argument in "$@"; do
  case "$argument" in
    --preflight-only) preflight_only=true ;;
    --resume-unverified) resume_unverified=true ;;
    --rollback) rollback_release=true ;;
    --clean-epoch-cutover) clean_epoch_cutover=true ;;
    *)
      echo "Usage: deploy.sh [--preflight-only|--resume-unverified|--rollback] [--clean-epoch-cutover]" >&2
      exit 2
      ;;
  esac
done

selected_modes=0
[[ "$preflight_only" == true ]] && selected_modes=$((selected_modes + 1))
[[ "$rollback_release" == true ]] && selected_modes=$((selected_modes + 1))
[[ "$clean_epoch_cutover" == true ]] && selected_modes=$((selected_modes + 1))
if ((selected_modes > 1)); then
  echo "Preflight, rollback, and clean-epoch cutover modes are mutually exclusive." >&2
  exit 2
fi
if [[ "$resume_unverified" == true && \
  ( "$preflight_only" == true || "$rollback_release" == true ) ]]; then
  echo "Only a normal or clean-epoch deployment can resume an unverified target." >&2
  exit 2
fi

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
DEPLOY_SELF_STAGED_FILE="${PRESSLY_DEPLOY_SELF_STAGED_FILE:-}"
DEPLOY_SELF_STAGED_TOOLING_FILE="${PRESSLY_DEPLOY_SELF_STAGED_TOOLING_FILE:-}"
DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE="${PRESSLY_DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE:-}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
DEPLOY_TOOLING_FILE="${PRESSLY_DEPLOY_TOOLING_FILE:-$REPO_DIR/deploy/aws/lightsail/deployment-tooling.mjs}"
PRESSLY_TOOLING_ERROR_FACTORY_PATH="${PRESSLY_TOOLING_ERROR_FACTORY_PATH:-$REPO_DIR/platform/errors/src/tooling-error.mjs}"
export DEPLOY_TOOLING_FILE PRESSLY_TOOLING_ERROR_FACTORY_PATH
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
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/deploy/aws/lightsail/docker-compose.production.yml}"
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
CLEAN_EPOCH_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch.json}"
CLEAN_EPOCH_SCRIPT="${PRESSLY_CLEAN_EPOCH_SCRIPT:-$REPO_DIR/deploy/aws/lightsail/cutover-clean-epoch.sh}"
CLEAN_EPOCH_FENCE_FILE="${PRESSLY_CLEAN_EPOCH_FENCE_FILE:-$APP_ROOT/postgres-clean-epoch-fence.compose.yml}"
PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-}"
PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-}"
PRESSLY_WORKER_IMAGE="${PRESSLY_WORKER_IMAGE:-}"
PRESSLY_PROCESSOR_IMAGE="${PRESSLY_PROCESSOR_IMAGE:-}"
PRESSLY_CONTROL_IMAGE="${PRESSLY_CONTROL_IMAGE:-}"
RELEASE_FORMAT="five-image-v1"
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
  if [[ -e "$CLEAN_EPOCH_JOURNAL_FILE" || -L "$CLEAN_EPOCH_JOURNAL_FILE" ]]; then
    if [[ "$clean_epoch_cutover" != true ]]; then
      echo "Active clean-epoch journal blocks ordinary deployment: $CLEAN_EPOCH_JOURNAL_FILE" >&2
      exit 75
    fi
    if [[ "$resume_unverified" != true ]]; then
      echo "An interrupted clean-epoch cutover requires exact --resume-unverified admission." >&2
      exit 75
    fi
  fi
}

stage_deployment_script() {
  if [[ -n "$DEPLOY_SELF_STAGED_FILE" ]]; then
    return
  fi

  DEPLOY_SELF_STAGED_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.deploy.XXXXXX")"
  DEPLOY_SELF_STAGED_TOOLING_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.deploy-tooling.XXXXXX.mjs")"
  DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE="$(mktemp "${DEPLOY_LOCK_FILE}.tooling-error.XXXXXX.mjs")"
  cp "$0" "$DEPLOY_SELF_STAGED_FILE"
  cp "$DEPLOY_TOOLING_FILE" "$DEPLOY_SELF_STAGED_TOOLING_FILE"
  cp "$PRESSLY_TOOLING_ERROR_FACTORY_PATH" "$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE"
  chmod 700 \
    "$DEPLOY_SELF_STAGED_FILE" \
    "$DEPLOY_SELF_STAGED_TOOLING_FILE" \
    "$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE"
  export \
    PRESSLY_DEPLOY_SELF_STAGED_FILE="$DEPLOY_SELF_STAGED_FILE" \
    PRESSLY_DEPLOY_SELF_STAGED_TOOLING_FILE="$DEPLOY_SELF_STAGED_TOOLING_FILE" \
    PRESSLY_DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE="$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE" \
    PRESSLY_DEPLOY_TOOLING_FILE="$DEPLOY_SELF_STAGED_TOOLING_FILE" \
    PRESSLY_TOOLING_ERROR_FACTORY_PATH="$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE"
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

  node "$DEPLOY_TOOLING_FILE" deployment-state-operation \
    "$DEPLOYMENT_STATE_FILE" \
    "$action" \
    "$invocation_mode" \
    "$RELEASE_FORMAT" \
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
    "$exit_code"
}

guard_deployment_state() {
  if [[ "$resume_unverified" == true ]]; then
    if [[
      "$clean_epoch_cutover" == true &&
      ( -e "$CLEAN_EPOCH_JOURNAL_FILE" || -L "$CLEAN_EPOCH_JOURNAL_FILE" )
    ]]; then
      clean_epoch_resume_admission="$(
        node "$DEPLOY_TOOLING_FILE" clean-epoch-finalization-admission \
          "$CLEAN_EPOCH_JOURNAL_FILE" \
          "$DEPLOYMENT_STATE_FILE" \
          "${DEPLOY_SHA,,}" \
          "$PRESSLY_API_IMAGE" \
          "$PRESSLY_WEB_IMAGE" \
          "$PRESSLY_WORKER_IMAGE" \
          "$PRESSLY_PROCESSOR_IMAGE" \
          "$PRESSLY_CONTROL_IMAGE"
      )"
      case "$clean_epoch_resume_admission" in
        resume)
          deployment_state_operation "guard" "resume" "-" "-" "-"
          ;;
        finalize)
          echo 'Resuming an exact verified clean-epoch target to reconcile its retained journal.'
          ;;
        *)
          echo 'Clean-epoch finalization admission returned an invalid result.' >&2
          exit 1
          ;;
      esac
    else
      deployment_state_operation "guard" "resume" "-" "-" "-"
    fi
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
  node "$DEPLOY_TOOLING_FILE" health-hostname "$1"
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
  preflight_health_hostname "Processor" "$PROCESSOR_HEALTH_URL"
  preflight_health_hostname "Control" "$CONTROL_HEALTH_URL"
}

durably_install_release_pair() {
  local release_tmp="$1"
  local release_path="$2"
  local metadata_tmp="$3"
  local metadata_path="$4"

  node "$DEPLOY_TOOLING_FILE" durably-install-release-pair \
    "$release_tmp" \
    "$release_path" \
    "$metadata_tmp" \
    "$metadata_path"
}

install_ops_bundle() {
  local source_sha="$1"
  local link_name="$2"

  node "$DEPLOY_TOOLING_FILE" install-ops-bundle \
    "$REPO_DIR/deploy/aws/lightsail" \
    "$OPS_ROOT" \
    "$source_sha" \
    "$link_name" \
    "$REPO_DIR/deploy/aws/lightsail/deployment-tooling.mjs" \
    "$REPO_DIR/platform/errors/src/tooling-error.mjs"
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
  if [[
    "$preflight_only" != true &&
    "$deployment_completed" != true &&
    "$exit_code" -ne 0
  ]]; then
    if [[
      "$clean_epoch_cutover" == true &&
      ( -e "$CLEAN_EPOCH_JOURNAL_FILE" || -L "$CLEAN_EPOCH_JOURNAL_FILE" ) &&
      -x "$CLEAN_EPOCH_SCRIPT"
    ]]; then
      if ! "$CLEAN_EPOCH_SCRIPT" fail-safe; then
        echo "Failed to preserve the clean-epoch service fence." >&2
      fi
    fi
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

  if [[ -n "$DEPLOY_SELF_STAGED_FILE" ]]; then
    rm -f "$DEPLOY_SELF_STAGED_FILE"
  fi
  if [[ -n "$DEPLOY_SELF_STAGED_TOOLING_FILE" ]]; then
    rm -f "$DEPLOY_SELF_STAGED_TOOLING_FILE"
  fi
  if [[ -n "$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE" ]]; then
    rm -f "$DEPLOY_SELF_STAGED_ERROR_FACTORY_FILE"
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

for required_command in git docker curl getent node stat mktemp sha256sum flock; do
  if ! command -v "$required_command" >/dev/null; then
    echo "Missing deployment prerequisite: $required_command" >&2
    exit 1
  fi
done

for required_tooling_file in \
  "$DEPLOY_TOOLING_FILE" \
  "$PRESSLY_TOOLING_ERROR_FACTORY_PATH"; do
  if [[ ! -f "$required_tooling_file" ]]; then
    echo "Missing deployment tooling file: $required_tooling_file" >&2
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
node "$DEPLOY_TOOLING_FILE" validate-ipv4 "$EXPECTED_PUBLIC_IP"

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
  "$BACKUP_ENV_FILE" \
  "$CONTROL_ENV_FILE"
)

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
node "$DEPLOY_TOOLING_FILE" release-metadata-preflight \
  "$CURRENT_RELEASE_FILE" \
  "$CURRENT_RELEASE_METADATA_FILE" \
  "$snapshot_output" \
  "$RELEASE_FORMAT" \
  "${DEPLOY_SHA,,}" \
  "$PRESSLY_API_IMAGE" \
  "$PRESSLY_WEB_IMAGE" \
  "$PRESSLY_WORKER_IMAGE" \
  "$PRESSLY_PROCESSOR_IMAGE" \
  "$PRESSLY_CONTROL_IMAGE" \
  "$DEPLOYMENT_STATE_FILE" \
  "$rollback_release"

if [[ "$preflight_only" == true ]]; then
  cd "$REPO_DIR"
  git cat-file -e "$DEPLOY_SHA^{commit}"
  preflight_sha="$(git rev-parse --verify "$DEPLOY_SHA^{commit}")"
  if [[ "$preflight_sha" != "${DEPLOY_SHA,,}" ]]; then
    echo "Resolved commit $preflight_sha does not match requested commit $DEPLOY_SHA." >&2
    exit 1
  fi
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "Missing compose file: $COMPOSE_FILE" >&2
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
    node "$DEPLOY_TOOLING_FILE" json-file-field \
      "$release_snapshot_tmp" sourceSha
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

# Validate deployment selection from the target checkout. Keeping this after
# the reversible checkout lets a release move a canonical source path without
# requiring a compatibility copy in the currently deployed checkout.
if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi
if [[ "$clean_epoch_cutover" == true && ! -x "$CLEAN_EPOCH_SCRIPT" ]]; then
  echo "Missing executable clean-epoch cutover: $CLEAN_EPOCH_SCRIPT" >&2
  exit 1
fi
docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  config --quiet

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
verify_image_revision "Worker" "$PRESSLY_WORKER_IMAGE"
verify_image_revision "Processor" "$PRESSLY_PROCESSOR_IMAGE"
verify_image_revision "Control" "$PRESSLY_CONTROL_IMAGE"

# Migration is the first potentially durable target mutation. Persist the
# conservative state before invoking it so any partial or unknown migration
# outcome blocks unrelated releases and remains eligible for exact recovery.
if [[ "$recovery_in_progress" != true ]]; then
  write_deployment_state "running_unverified" "in_progress" "-"
fi
target_runtime_mutation_started=true
deployment_state_tracking_started=true

if [[ "$clean_epoch_cutover" == true ]]; then
  "$CLEAN_EPOCH_SCRIPT" prepare
fi

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm --workdir /repo migrate \
  node --import tsx tooling/postgres/migrate.ts

runtime_compose_files=(-f "$COMPOSE_FILE")
if [[ "$clean_epoch_cutover" == true ]]; then
  if [[
    ! -f "$CLEAN_EPOCH_FENCE_FILE" ||
    -L "$CLEAN_EPOCH_FENCE_FILE" ||
    "$(stat -c '%a' "$CLEAN_EPOCH_FENCE_FILE")" != 600
  ]]; then
    echo "Clean-epoch service fence must be a mode-600 regular file: $CLEAN_EPOCH_FENCE_FILE" >&2
    exit 1
  fi
  runtime_compose_files+=(-f "$CLEAN_EPOCH_FENCE_FILE")
fi

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  "${runtime_compose_files[@]}" \
  up -d --remove-orphans --wait

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  "${runtime_compose_files[@]}" \
  ps

# DNS may change during checkout, migration, or container replacement. Recheck
# immediately before the pinned health probes so another host cannot satisfy
# the public routing prerequisite.
preflight_health_hostnames

wait_for_health "API" "$API_HEALTH_URL"
wait_for_health "Web" "$WEB_HEALTH_URL"
wait_for_health "Processor" "$PROCESSOR_HEALTH_URL"
wait_for_health "Control" "$CONTROL_HEALTH_URL"

# The probes above deliberately pin TLS to this host. Confirm live DNS still
# routes every public surface here before release metadata or verified state
# can become authoritative.
preflight_health_hostnames

if [[ "$clean_epoch_cutover" == true ]]; then
  "$CLEAN_EPOCH_SCRIPT" mark-public-verified
fi

deployed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
current_release_tmp="$(mktemp "${CURRENT_RELEASE_FILE}.tmp.XXXXXX")"
current_metadata_tmp="$(mktemp "${CURRENT_RELEASE_METADATA_FILE}.tmp.XXXXXX")"
printf '%s\n' "$target_sha" > "$current_release_tmp"
printf '{"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","deployedAt":"%s"}\n' \
  "$target_sha" \
  "$PRESSLY_API_IMAGE" \
  "$PRESSLY_WEB_IMAGE" \
  "$PRESSLY_WORKER_IMAGE" \
  "$PRESSLY_PROCESSOR_IMAGE" \
  "$PRESSLY_CONTROL_IMAGE" \
  "$deployed_at" > "$current_metadata_tmp"
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
if [[ "$clean_epoch_cutover" == true ]]; then
  "$CLEAN_EPOCH_SCRIPT" finalize
fi
deployment_completed=true

echo "Deployed source SHA: $target_sha"
echo "API image: $PRESSLY_API_IMAGE"
echo "Web image: $PRESSLY_WEB_IMAGE"
echo "Worker image: $PRESSLY_WORKER_IMAGE"
echo "Processor image: $PRESSLY_PROCESSOR_IMAGE"
echo "Control image: $PRESSLY_CONTROL_IMAGE"
echo "Deployment time: $deployed_at"
emit_deployment_event "succeeded" 0
