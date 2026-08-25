#!/usr/bin/env bash
set -euo pipefail
umask 077

MODE="${1:-}"
case "$MODE" in
  ''|--preflight-only) ;;
  --help|-h)
    cat <<'EOF'
Usage: recover-clean-epoch.sh [--preflight-only]

Restores the retained legacy database and its exact five-image release as one
resumable recovery while an interrupted clean database epoch remains journaled.
Run --preflight-only first, then set the exact confirmation and SHA bindings it
prints before running without arguments.
EOF
    exit 0
    ;;
  *)
    echo 'Usage: recover-clean-epoch.sh [--preflight-only]' >&2
    exit 2
    ;;
esac

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
OPS_ROOT="${PRESSLY_OPS_ROOT:-$APP_ROOT/ops}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/deploy/aws/lightsail/docker-compose.production.yml}"
LEGACY_COMPOSE_OVERRIDE_FILE="${PRESSLY_CLEAN_EPOCH_LEGACY_COMPOSE_OVERRIDE_FILE:-$REPO_DIR/deploy/aws/lightsail/clean-epoch-legacy-compose.override.yml}"
DECLARATION_FILE="${PRESSLY_CLEAN_EPOCH_DECLARATION:-$REPO_DIR/deploy/aws/lightsail/clean-epoch-cutover.json}"
DEPLOY_TOOLING_FILE="${PRESSLY_DEPLOY_TOOLING_FILE:-$REPO_DIR/deploy/aws/lightsail/deployment-tooling.mjs}"
PRESSLY_TOOLING_ERROR_FACTORY_PATH="${PRESSLY_TOOLING_ERROR_FACTORY_PATH:-$REPO_DIR/platform/errors/src/tooling-error.mjs}"
ROLLBACK_SCRIPT="${PRESSLY_CLEAN_EPOCH_ROLLBACK_SCRIPT:-$OPS_ROOT/candidate/rollback.sh}"
OPS_SOURCE_SHA_FILE="${PRESSLY_CLEAN_EPOCH_OPS_SOURCE_SHA_FILE:-}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
OPERATION_LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_LOCK_FILE="$OPERATION_LOCK_DIR/postgres-backup.lock"
BACKUP_DIR="${PRESSLY_BACKUP_DIR:-$APP_ROOT/backups/postgres}"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
CUTOVER_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch.json}"
CUTOVER_EVIDENCE_FILE="${PRESSLY_CLEAN_EPOCH_EVIDENCE_FILE:-$APP_ROOT/postgres-clean-epoch-last.json}"
SERVICE_FENCE_FILE="${PRESSLY_CLEAN_EPOCH_FENCE_FILE:-$APP_ROOT/postgres-clean-epoch-fence.compose.yml}"
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
CURRENT_RELEASE_METADATA_FILE="${PRESSLY_CURRENT_RELEASE_METADATA_FILE:-$APP_ROOT/current-release.json}"
PREVIOUS_RELEASE_METADATA_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
DEPLOYMENT_STATE_FILE="${PRESSLY_DEPLOYMENT_STATE_FILE:-$APP_ROOT/deployment-state.json}"
EXPECTED_LEGACY_SHA="${PRESSLY_CLEAN_EPOCH_EXPECTED_LEGACY_SHA:-}"
EXPECTED_TARGET_SHA="${PRESSLY_CLEAN_EPOCH_EXPECTED_TARGET_SHA:-}"
RECOVERY_CONFIRM="${PRESSLY_CLEAN_EPOCH_RECOVERY_CONFIRM:-}"
EXPECTED_PUBLIC_IP="${PRESSLY_EXPECTED_PUBLIC_IP:-}"
API_HEALTH_URL="${PRESSLY_API_HEALTH_URL:-https://api.trypressly.com/health/ready}"
WEB_HEALTH_URL="${PRESSLY_WEB_HEALTH_URL:-https://trypressly.com/health}"
PROCESSOR_HEALTH_URL="${PRESSLY_PROCESSOR_HEALTH_URL:-https://processor.trypressly.com/health}"
CONTROL_HEALTH_URL="${PRESSLY_CONTROL_HEALTH_URL:-https://control.trypressly.com/health}"
HEALTH_MAX_ATTEMPTS="${PRESSLY_HEALTH_MAX_ATTEMPTS:-30}"
HEALTH_RETRY_DELAY_SECONDS="${PRESSLY_HEALTH_RETRY_DELAY_SECONDS:-2}"
HEALTH_REQUEST_TIMEOUT_SECONDS="${PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS:-10}"
TEST_KILL_PHASE="${PRESSLY_CLEAN_EPOCH_RECOVERY_TEST_KILL_PHASE:-}"

export DEPLOY_TOOLING_FILE PRESSLY_TOOLING_ERROR_FACTORY_PATH

fail() {
  echo "Clean database epoch recovery failed: $*" >&2
  exit 1
}

for command in curl docker flock getent grep node sed seq sha256sum sleep stat; do
  command -v "$command" >/dev/null || fail "missing required command: $command"
done
for file in "$COMPOSE_ENV_FILE" "$POSTGRES_ENV_FILE"; do
  [[ -f "$file" && ! -L "$file" && "$(stat -c '%a' "$file")" == 600 ]] ||
    fail "expected a mode-600 environment file: $file"
done
for file in \
  "$COMPOSE_FILE" \
  "$LEGACY_COMPOSE_OVERRIDE_FILE" \
  "$DECLARATION_FILE" \
  "$DEPLOY_TOOLING_FILE" \
  "$PRESSLY_TOOLING_ERROR_FACTORY_PATH"; do
  [[ -f "$file" && ! -L "$file" ]] || fail "missing regular recovery file: $file"
done
[[ ! -e "$RESTORE_JOURNAL_FILE" && ! -L "$RESTORE_JOURNAL_FILE" ]] ||
  fail "active Postgres restore journal blocks clean-epoch recovery: $RESTORE_JOURNAL_FILE"
[[ "$HEALTH_MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] ||
  fail 'PRESSLY_HEALTH_MAX_ATTEMPTS must be a positive integer'
[[ "$HEALTH_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] ||
  fail 'PRESSLY_HEALTH_RETRY_DELAY_SECONDS must be a non-negative integer'
[[ "$HEALTH_REQUEST_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]] ||
  fail 'PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS must be a positive integer'

if [[ "${PRESSLY_DEPLOY_LOCK_HELD:-}" == 1 ]]; then
  flock -n 9 || fail 'inherited deployment lock is invalid'
else
  exec 9> "$DEPLOY_LOCK_FILE"
  if ! flock -n 9; then
    echo 'Another deployment, rollback, restore, or cutover is in progress.' >&2
    exit 75
  fi
  export PRESSLY_DEPLOY_LOCK_HELD=1
fi

mkdir -p "$OPERATION_LOCK_DIR"
chmod 700 "$OPERATION_LOCK_DIR"
exec 8> "$BACKUP_LOCK_FILE"
if ! flock --nonblock 8; then
  echo 'Another Postgres backup, restore, or cutover is already running.' >&2
  exit 75
fi

set -a
# shellcheck disable=SC1090
source "$POSTGRES_ENV_FILE"
set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

compose() {
  docker compose \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    -f "$LEGACY_COMPOSE_OVERRIDE_FILE" \
    "$@"
}

fenced_compose() {
  docker compose \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    -f "$LEGACY_COMPOSE_OVERRIDE_FILE" \
    -f "$SERVICE_FENCE_FILE" \
    "$@"
}

postgres_exec() {
  compose exec -T postgres "$@"
}

json_field() {
  node "$DEPLOY_TOOLING_FILE" json-file-field "$1" "$2"
}

json_nested_field() {
  node "$DEPLOY_TOOLING_FILE" json-file-nested-string-field "$1" "$2" "$3"
}

CUTOVER_ID=''
LEGACY_SHA=''
LEGACY_API_IMAGE=''
LEGACY_WEB_IMAGE=''
LEGACY_WORKER_IMAGE=''
LEGACY_PROCESSOR_IMAGE=''
LEGACY_CONTROL_IMAGE=''
LEGACY_WEB_CACHE_PATH=''
LEGACY_LEDGER_SHA256=''
BACKUP_BASENAME=''
BACKUP_SHA256=''
TARGET_SHA=''
TARGET_API_IMAGE=''
TARGET_WEB_IMAGE=''
TARGET_WORKER_IMAGE=''
TARGET_PROCESSOR_IMAGE=''
TARGET_CONTROL_IMAGE=''
TARGET_JOURNAL_SHA256=''
TARGET_TREE_SHA256=''
TARGET_DATABASE=''
CANDIDATE_DATABASE=''
QUARANTINE_DATABASE=''
CUTOVER_PHASE=''
STATE_FILE=''
EXPECTED_CONFIRM=''

journal_operation() {
  local action="$1"
  local phase="$2"
  node "$DEPLOY_TOOLING_FILE" clean-epoch-journal-operation \
    "$STATE_FILE" \
    "$CUTOVER_EVIDENCE_FILE" \
    "$action" \
    "$CUTOVER_ID" \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    "$LEGACY_LEDGER_SHA256" \
    "$BACKUP_BASENAME" \
    "$BACKUP_SHA256" \
    "$TARGET_SHA" \
    "$TARGET_API_IMAGE" \
    "$TARGET_WEB_IMAGE" \
    "$TARGET_WORKER_IMAGE" \
    "$TARGET_PROCESSOR_IMAGE" \
    "$TARGET_CONTROL_IMAGE" \
    "$TARGET_JOURNAL_SHA256" \
    "$TARGET_TREE_SHA256" \
    "$TARGET_DATABASE" \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE" \
    "$phase" \
    -
}

load_bindings() {
  local state_file="$1"
  local inspect_output
  local declaration_legacy_sha
  local journal_legacy_sha
  STATE_FILE="$state_file"

  CUTOVER_ID="$(json_field "$STATE_FILE" cutoverId)"
  journal_legacy_sha="$(json_field "$STATE_FILE" legacyReleaseSha)"
  LEGACY_SHA="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity sourceSha)"
  LEGACY_API_IMAGE="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity apiImage)"
  LEGACY_WEB_IMAGE="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity webImage)"
  LEGACY_WORKER_IMAGE="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity workerImage)"
  LEGACY_PROCESSOR_IMAGE="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity processorImage)"
  LEGACY_CONTROL_IMAGE="$(json_nested_field "$STATE_FILE" legacyReleaseIdentity controlImage)"
  LEGACY_LEDGER_SHA256="$(json_field "$STATE_FILE" legacyLedgerSha256)"
  BACKUP_BASENAME="$(json_field "$STATE_FILE" backupBasename)"
  BACKUP_SHA256="$(json_field "$STATE_FILE" backupSha256)"
  TARGET_SHA="$(json_nested_field "$STATE_FILE" targetReleaseIdentity sourceSha)"
  TARGET_API_IMAGE="$(json_nested_field "$STATE_FILE" targetReleaseIdentity apiImage)"
  TARGET_WEB_IMAGE="$(json_nested_field "$STATE_FILE" targetReleaseIdentity webImage)"
  TARGET_WORKER_IMAGE="$(json_nested_field "$STATE_FILE" targetReleaseIdentity workerImage)"
  TARGET_PROCESSOR_IMAGE="$(json_nested_field "$STATE_FILE" targetReleaseIdentity processorImage)"
  TARGET_CONTROL_IMAGE="$(json_nested_field "$STATE_FILE" targetReleaseIdentity controlImage)"
  TARGET_JOURNAL_SHA256="$(json_field "$STATE_FILE" targetJournalSha256)"
  TARGET_TREE_SHA256="$(json_field "$STATE_FILE" targetTreeSha256)"
  TARGET_DATABASE="$(json_field "$STATE_FILE" targetDatabase)"
  CANDIDATE_DATABASE="$(json_field "$STATE_FILE" candidateDatabase)"
  QUARANTINE_DATABASE="$(json_field "$STATE_FILE" quarantineDatabase)"

  declaration_legacy_sha="$(json_field "$DECLARATION_FILE" legacyReleaseSha)"
  [[ "$CUTOVER_ID" == "$(json_field "$DECLARATION_FILE" cutoverId)" ]] ||
    fail 'journal cutover ID differs from the reviewed declaration'
  [[ "$journal_legacy_sha" == "$LEGACY_SHA" && "$LEGACY_SHA" == "$declaration_legacy_sha" ]] ||
    fail 'journal legacy release differs from the reviewed declaration'
  [[ "$LEGACY_LEDGER_SHA256" == "$(json_field "$DECLARATION_FILE" legacyLedgerSha256)" ]] ||
    fail 'journal legacy ledger differs from the reviewed declaration'
  [[ "$TARGET_JOURNAL_SHA256" == "$(json_field "$DECLARATION_FILE" targetJournalSha256)" ]] ||
    fail 'journal target ledger differs from the reviewed declaration'
  [[ "$TARGET_TREE_SHA256" == "$(json_field "$DECLARATION_FILE" targetTreeSha256)" ]] ||
    fail 'journal target migration tree differs from the reviewed declaration'
  [[ "$TARGET_DATABASE" == "$POSTGRES_DB" ]] ||
    fail 'journal target database differs from the configured production database'

  inspect_output="$(journal_operation inspect -)"
  mapfile -t inspect_fields <<< "$inspect_output"
  [[ "${#inspect_fields[@]}" == 4 ]] || fail 'journal inspection returned invalid bindings'
  CUTOVER_PHASE="${inspect_fields[0]}"
  EXPECTED_CONFIRM="RECOVER_CLEAN_EPOCH:$CUTOVER_ID:$LEGACY_SHA:$TARGET_SHA"

  if [[ -n "$EXPECTED_LEGACY_SHA" && "$EXPECTED_LEGACY_SHA" != "$LEGACY_SHA" ]]; then
    fail 'expected legacy SHA does not match the journal'
  fi
  if [[ -n "$EXPECTED_TARGET_SHA" && "$EXPECTED_TARGET_SHA" != "$TARGET_SHA" ]]; then
    fail 'expected target SHA does not match the journal'
  fi
  if [[ -n "$OPS_SOURCE_SHA_FILE" ]]; then
    [[ -f "$OPS_SOURCE_SHA_FILE" && ! -L "$OPS_SOURCE_SHA_FILE" ]] ||
      fail 'operations bundle source marker is missing or unsafe'
    [[ "$(< "$OPS_SOURCE_SHA_FILE")" == "$TARGET_SHA" ]] ||
      fail 'recovery operations bundle is not the exact cutover target'
  elif [[ "$MODE" != --preflight-only ]]; then
    fail 'mutating recovery must run from the checksummed target operations bundle'
  fi
}

verify_backup() {
  local backup_file="$BACKUP_DIR/$BACKUP_BASENAME"
  [[ -f "$backup_file" && ! -L "$backup_file" ]] ||
    fail "retained cutover backup is missing: $backup_file"
  [[ "$(sha256sum "$backup_file" | cut -d' ' -f1)" == "$BACKUP_SHA256" ]] ||
    fail 'retained cutover backup digest differs from the journal'
}

derive_legacy_web_cache_path() {
  local image_config
  image_config="$(
    docker image inspect --format '{{json .Config}}' "$LEGACY_WEB_IMAGE"
  )"
  node --input-type=module - "$image_config" <<'NODE'
import { posix } from 'node:path';
const config = JSON.parse(process.argv[2]);
const command = config?.Cmd;
const workingDirectory = config?.WorkingDir || '/';
if (
  !Array.isArray(command) ||
  command.length < 2 ||
  command[0] !== 'node' ||
  typeof command[1] !== 'string' ||
  typeof workingDirectory !== 'string' ||
  !workingDirectory.startsWith('/')
) process.exit(1);
const serverPath = command[1].startsWith('/')
  ? posix.normalize(command[1])
  : posix.resolve(workingDirectory, command[1]);
const cachePath = posix.join(posix.dirname(serverPath), '.next', 'cache');
if (
  posix.basename(serverPath) !== 'server.js' ||
  !/^\/[A-Za-z0-9._/-]+$/u.test(cachePath) ||
  cachePath.includes('//')
) process.exit(1);
process.stdout.write(`${cachePath}\n`);
NODE
}

database_topology() {
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d postgres \
    -AtF '|' \
    -v target_database="$TARGET_DATABASE" \
    -v candidate_database="$CANDIDATE_DATABASE" \
    -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT
  (SELECT count(*) FROM pg_database WHERE datname = :'target_database'),
  (SELECT count(*) FROM pg_database WHERE datname = :'candidate_database'),
  (SELECT count(*) FROM pg_database WHERE datname = :'quarantine_database');
SQL
}

classify_topology() {
  case "$1" in
    '1|0|0') echo target_only ;;
    '1|1|0') echo target_and_candidate ;;
    '0|1|1') echo candidate_and_quarantine ;;
    '1|0|1') echo target_and_quarantine ;;
    *) fail "unsafe clean-epoch recovery database topology: $1" ;;
  esac
}

assert_phase_topology() {
  case "$CUTOVER_PHASE:$1" in
    preparing:target_only|preparing:target_and_candidate|candidate_ready:target_and_candidate|candidate_ready:candidate_and_quarantine|legacy_quarantined:candidate_and_quarantine|legacy_quarantined:target_and_quarantine|candidate_promoted:target_and_quarantine|validated:target_and_quarantine|public_verified:target_and_quarantine|aborting:target_only|aborting:target_and_candidate|aborting:candidate_and_quarantine|aborting:target_and_quarantine|aborted:target_only|aborted:target_and_candidate) ;;
    *) fail "clean-epoch phase $CUTOVER_PHASE conflicts with recovery topology $1" ;;
  esac
}

ensure_postgres_ready() {
  local ready=false
  compose up -d postgres
  for _ in $(seq 1 30); do
    if postgres_exec pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ "$ready" == true ]] || fail 'Postgres did not become ready for clean-epoch recovery'
}

ensure_service_fence() {
  node "$DEPLOY_TOOLING_FILE" ensure-service-fence "$SERVICE_FENCE_FILE"
}

fence_services() {
  local container_id
  local -a tool_container_ids=()
  ensure_service_fence
  mapfile -t tool_container_ids < <(
    compose ps --all --quiet migrate backup restore
  )
  if (( ${#tool_container_ids[@]} > 0 )); then
    docker rm --force "${tool_container_ids[@]}" >/dev/null
  fi
  for service in caddy api worker; do
    container_id="$(compose ps -aq "$service")"
    if [[ -n "$container_id" ]]; then
      docker update --restart=no "$container_id" >/dev/null
    fi
  done
  compose stop caddy api worker
  for service in caddy api worker; do
    if compose ps --status running --services | grep -Fx "$service" >/dev/null; then
      fail "$service is still running after the clean-epoch recovery fence"
    fi
  done
  if [[ -n "$(compose ps --all --quiet migrate backup restore)" ]]; then
    fail 'a one-off database tooling container survived the clean-epoch recovery fence'
  fi
}

lift_service_fence() {
  local container_id
  local policy
  for service in api worker caddy; do
    container_id="$(compose ps -q "$service")"
    [[ -n "$container_id" ]] || fail "cannot lift recovery fence without running $service"
    docker update --restart=unless-stopped "$container_id" >/dev/null
    policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")"
    [[ "$policy" == unless-stopped ]] || fail "$service restart policy remains $policy"
  done
  if [[ -e "$SERVICE_FENCE_FILE" || -L "$SERVICE_FENCE_FILE" ]]; then
    node "$DEPLOY_TOOLING_FILE" remove-service-fence "$SERVICE_FENCE_FILE"
  fi
}

kill_after() {
  if [[ "$TEST_KILL_PHASE" == "$1" ]]; then
    echo "Clean-epoch recovery test kill after $1." >&2
    kill -KILL "$$"
  fi
}

set_database_connections() {
  local database="$1"
  local allowed="$2"
  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v database_name="$database" -v allowed="$allowed" <<'SQL'
SELECT format(
  'ALTER DATABASE %I ALLOW_CONNECTIONS %s',
  :'database_name',
  :'allowed'
) \gexec
SQL
}

terminate_database_connections() {
  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v database_name="$1" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'database_name'
  AND pid <> pg_backend_pid();
SQL
}

legacy_ledger_sha256() {
  local database="$1"
  local rows
  rows="$(
    postgres_exec psql \
      -v ON_ERROR_STOP=1 \
      -U "$POSTGRES_USER" \
      -d "$database" \
      -AtF '|' <<'SQL'
SELECT id::text, hash, created_at::text
FROM drizzle.__drizzle_migrations
ORDER BY created_at ASC, id ASC;
SQL
  )"
  printf '%s\n' "$rows" | sha256sum | cut -d' ' -f1
}

assert_legacy_database() {
  local database="$1"
  [[ "$(legacy_ledger_sha256 "$database")" == "$LEGACY_LEDGER_SHA256" ]] ||
    fail "database $database does not contain the exact declared legacy ledger"
}

restore_legacy_topology() {
  local topology
  topology="$(classify_topology "$(database_topology)")"

  case "$topology" in
    target_only)
      set_database_connections "$TARGET_DATABASE" true
      assert_legacy_database "$TARGET_DATABASE"
      ;;
    target_and_candidate)
      set_database_connections "$TARGET_DATABASE" true
      assert_legacy_database "$TARGET_DATABASE"
      terminate_database_connections "$CANDIDATE_DATABASE"
      set_database_connections "$CANDIDATE_DATABASE" false
      ;;
    candidate_and_quarantine)
      set_database_connections "$QUARANTINE_DATABASE" true
      assert_legacy_database "$QUARANTINE_DATABASE"
      terminate_database_connections "$CANDIDATE_DATABASE"
      terminate_database_connections "$QUARANTINE_DATABASE"
      set_database_connections "$CANDIDATE_DATABASE" false
      set_database_connections "$QUARANTINE_DATABASE" false
      postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
        -v quarantine_database="$QUARANTINE_DATABASE" \
        -v target_database="$TARGET_DATABASE" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'quarantine_database',
  :'target_database'
) \gexec
SQL
      kill_after after_legacy_rename_before_allow
      set_database_connections "$TARGET_DATABASE" true
      kill_after after_legacy_to_target
      ;;
    target_and_quarantine)
      set_database_connections "$QUARANTINE_DATABASE" true
      assert_legacy_database "$QUARANTINE_DATABASE"
      terminate_database_connections "$TARGET_DATABASE"
      terminate_database_connections "$QUARANTINE_DATABASE"
      set_database_connections "$TARGET_DATABASE" false
      set_database_connections "$QUARANTINE_DATABASE" false
      postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
        -v target_database="$TARGET_DATABASE" \
        -v candidate_database="$CANDIDATE_DATABASE" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'target_database',
  :'candidate_database'
) \gexec
SQL
      kill_after after_target_to_candidate
      postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
        -v quarantine_database="$QUARANTINE_DATABASE" \
        -v target_database="$TARGET_DATABASE" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'quarantine_database',
  :'target_database'
) \gexec
SQL
      kill_after after_legacy_rename_before_allow
      set_database_connections "$TARGET_DATABASE" true
      kill_after after_legacy_to_target
      ;;
  esac

  topology="$(classify_topology "$(database_topology)")"
  [[ "$topology" == target_only || "$topology" == target_and_candidate ]] ||
    fail "legacy database restoration ended in topology $topology"
  set_database_connections "$TARGET_DATABASE" true
  [[ "$(
    postgres_exec psql \
      -v ON_ERROR_STOP=1 \
      -U "$POSTGRES_USER" \
      -d postgres \
      -At \
      -v target_database="$TARGET_DATABASE" <<'SQL'
SELECT datallowconn
FROM pg_database
WHERE datname = :'target_database';
SQL
  )" == t ]] || fail 'restored legacy database still refuses connections'
  assert_legacy_database "$TARGET_DATABASE"
  if [[ "$topology" == target_and_candidate ]]; then
    terminate_database_connections "$CANDIDATE_DATABASE"
    set_database_connections "$CANDIDATE_DATABASE" false
  fi
}

restore_runtime_connect() {
  local has_connect
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d postgres \
    -v target_database="$TARGET_DATABASE" <<'SQL'
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO pressly_runtime',
  :'target_database'
) \gexec
SQL
  has_connect="$(
    postgres_exec psql \
      -v ON_ERROR_STOP=1 \
      -U "$POSTGRES_USER" \
      -d postgres \
      -At \
      -v target_database="$TARGET_DATABASE" <<'SQL'
SELECT has_database_privilege(
  'pressly_runtime',
  :'target_database',
  'CONNECT'
);
SQL
  )"
  [[ "$has_connect" == t ]] ||
    fail 'pressly_runtime CONNECT was not restored on the legacy database'
}

release_admission() {
  node "$DEPLOY_TOOLING_FILE" clean-epoch-recovery-admission \
    "$CURRENT_RELEASE_FILE" \
    "$CURRENT_RELEASE_METADATA_FILE" \
    "$PREVIOUS_RELEASE_METADATA_FILE" \
    "$DEPLOYMENT_STATE_FILE" \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    "$TARGET_SHA" \
    "$TARGET_API_IMAGE" \
    "$TARGET_WEB_IMAGE" \
    "$TARGET_WORKER_IMAGE" \
    "$TARGET_PROCESSOR_IMAGE" \
    "$TARGET_CONTROL_IMAGE"
}

preflight_health_hostname() {
  local application="$1"
  local url="$2"
  local hostname
  local resolved_addresses
  local address
  local expected_found=false
  local unexpected_found=false
  hostname="$(node "$DEPLOY_TOOLING_FILE" health-hostname "$url")"
  resolved_addresses="$(getent ahostsv4 "$hostname")" ||
    fail "$application DNS preflight failed for $hostname"
  [[ -n "$resolved_addresses" ]] || fail "$application DNS returned no IPv4 address"
  while read -r address _; do
    if [[ "$address" == "$EXPECTED_PUBLIC_IP" ]]; then
      expected_found=true
    else
      unexpected_found=true
    fi
  done <<< "$resolved_addresses"
  [[ "$expected_found" == true && "$unexpected_found" == false ]] ||
    fail "$application DNS does not resolve exclusively to the expected production IP"
}

wait_for_health() {
  local application="$1"
  local url="$2"
  local hostname
  local attempt
  hostname="$(node "$DEPLOY_TOOLING_FILE" health-hostname "$url")"
  for ((attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1)); do
    if curl \
      --fail \
      --silent \
      --show-error \
      --max-time "$HEALTH_REQUEST_TIMEOUT_SECONDS" \
      --resolve "$hostname:443:$EXPECTED_PUBLIC_IP" \
      "$url" >/dev/null; then
      echo "$application recovery health check passed."
      return 0
    fi
    if ((attempt < HEALTH_MAX_ATTEMPTS)); then
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done
  fail "$application recovery health check failed after $HEALTH_MAX_ATTEMPTS attempts"
}

verify_runtime_identity() {
  local service="$1"
  local expected_image="$2"
  local container_id
  local actual_image
  container_id="$(compose ps -q "$service")"
  [[ -n "$container_id" ]] || fail "legacy $service container is not running"
  actual_image="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
  [[ "$actual_image" == "$expected_image" ]] ||
    fail "legacy $service container image differs from verified release metadata"
}

verify_legacy_worker_health() {
  local container_id
  local healthcheck_json
  local attempt
  local -a healthcheck=()
  container_id="$(compose ps -q worker)"
  [[ -n "$container_id" ]] || fail 'legacy worker container is not running'
  healthcheck_json="$(
    docker image inspect \
      --format '{{json .Config.Healthcheck.Test}}' \
      "$LEGACY_WORKER_IMAGE"
  )"
  mapfile -t healthcheck < <(
    node --input-type=module - "$healthcheck_json" <<'NODE'
const value = JSON.parse(process.argv[2]);
if (
  !Array.isArray(value) ||
  value.length < 2 ||
  value[0] !== 'CMD' ||
  value.slice(1).some((entry) => typeof entry !== 'string' || entry.length === 0)
) process.exit(1);
process.stdout.write(`${value.slice(1).join('\n')}\n`);
NODE
  )
  (( ${#healthcheck[@]} > 0 )) ||
    fail 'legacy Worker image has no executable baked healthcheck'
  for ((attempt = 1; attempt <= HEALTH_MAX_ATTEMPTS; attempt += 1)); do
    if docker exec "$container_id" "${healthcheck[@]}" >/dev/null; then
      echo 'Worker recovery health check passed.'
      return 0
    fi
    if ((attempt < HEALTH_MAX_ATTEMPTS)); then
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done
  fail "Worker recovery health check failed after $HEALTH_MAX_ATTEMPTS attempts"
}

start_and_verify_legacy_runtime() {
  export \
    PRESSLY_RELEASE_SHA="$LEGACY_SHA" \
    PRESSLY_API_IMAGE="$LEGACY_API_IMAGE" \
    PRESSLY_WEB_IMAGE="$LEGACY_WEB_IMAGE" \
    PRESSLY_WORKER_IMAGE="$LEGACY_WORKER_IMAGE" \
    PRESSLY_PROCESSOR_IMAGE="$LEGACY_PROCESSOR_IMAGE" \
    PRESSLY_CONTROL_IMAGE="$LEGACY_CONTROL_IMAGE"
  ensure_service_fence
  fenced_compose up -d --remove-orphans
  for binding in \
    "api $LEGACY_API_IMAGE" \
    "web $LEGACY_WEB_IMAGE" \
    "worker $LEGACY_WORKER_IMAGE" \
    "processor $LEGACY_PROCESSOR_IMAGE" \
    "control $LEGACY_CONTROL_IMAGE"; do
    read -r service expected_image <<< "$binding"
    verify_runtime_identity "$service" "$expected_image"
  done
  verify_legacy_worker_health
  preflight_health_hostname API "$API_HEALTH_URL"
  preflight_health_hostname Web "$WEB_HEALTH_URL"
  preflight_health_hostname Processor "$PROCESSOR_HEALTH_URL"
  preflight_health_hostname Control "$CONTROL_HEALTH_URL"
  wait_for_health API "$API_HEALTH_URL"
  wait_for_health Web "$WEB_HEALTH_URL"
  wait_for_health Processor "$PROCESSOR_HEALTH_URL"
  wait_for_health Control "$CONTROL_HEALTH_URL"
  preflight_health_hostname API "$API_HEALTH_URL"
  preflight_health_hostname Web "$WEB_HEALTH_URL"
  preflight_health_hostname Processor "$PROCESSOR_HEALTH_URL"
  preflight_health_hostname Control "$CONTROL_HEALTH_URL"
}

current_release_tmp=''
current_metadata_tmp=''
commit_legacy_release() {
  local deployed_at
  local kill_after_pointer=false
  deployed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  current_release_tmp="$(mktemp "${CURRENT_RELEASE_FILE}.tmp.XXXXXX")"
  current_metadata_tmp="$(mktemp "${CURRENT_RELEASE_METADATA_FILE}.tmp.XXXXXX")"
  printf '%s\n' "$LEGACY_SHA" > "$current_release_tmp"
  printf '{"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","deployedAt":"%s"}\n' \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    "$deployed_at" > "$current_metadata_tmp"
  if [[ "$TEST_KILL_PHASE" == after_current_pointer_commit ]]; then
    kill_after_pointer=true
  fi
  node "$DEPLOY_TOOLING_FILE" durably-install-release-pair \
    "$current_release_tmp" \
    "$CURRENT_RELEASE_FILE" \
    "$current_metadata_tmp" \
    "$CURRENT_RELEASE_METADATA_FILE" \
    "$kill_after_pointer"
  current_release_tmp=''
  current_metadata_tmp=''
  node "$DEPLOY_TOOLING_FILE" deployment-state-operation \
    "$DEPLOYMENT_STATE_FILE" \
    write \
    - \
    five-image-v1 \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    - \
    "$CURRENT_RELEASE_METADATA_FILE" \
    verified \
    succeeded \
    0
}

recovery_complete=false
recovery_started=false
on_exit() {
  local exit_code="$?"
  if [[ -n "$current_release_tmp" ]]; then
    rm -f "$current_release_tmp"
  fi
  if [[ -n "$current_metadata_tmp" ]]; then
    rm -f "$current_metadata_tmp"
  fi
  if [[
    "$exit_code" -ne 0 &&
    "$recovery_started" == true &&
    ( -e "$CUTOVER_JOURNAL_FILE" || -L "$CUTOVER_JOURNAL_FILE" )
  ]]; then
    if ! fence_services; then
      echo 'Failed to preserve the clean-epoch recovery service fence.' >&2
    fi
  fi
  if [[ "$recovery_complete" != true && "$exit_code" -ne 0 ]]; then
    echo 'Clean database epoch recovery remains incomplete and resumable.' >&2
  fi
}
trap on_exit EXIT

if [[ -e "$CUTOVER_JOURNAL_FILE" || -L "$CUTOVER_JOURNAL_FILE" ]]; then
  [[ -f "$CUTOVER_JOURNAL_FILE" && ! -L "$CUTOVER_JOURNAL_FILE" && "$(stat -c '%a' "$CUTOVER_JOURNAL_FILE")" == 600 ]] ||
    fail 'active clean-epoch journal must be a mode-600 regular file'
  load_bindings "$CUTOVER_JOURNAL_FILE"
elif [[ -f "$CUTOVER_EVIDENCE_FILE" && ! -L "$CUTOVER_EVIDENCE_FILE" ]]; then
  load_bindings "$CUTOVER_EVIDENCE_FILE"
  [[ "$CUTOVER_PHASE" == aborted ]] ||
    fail "clean epoch has no active recovery journal and evidence phase is $CUTOVER_PHASE"
else
  fail 'clean-epoch recovery requires an active journal or exact aborted evidence'
fi

LEGACY_WEB_CACHE_PATH="$(derive_legacy_web_cache_path)"
[[ -n "$LEGACY_WEB_CACHE_PATH" ]] ||
  fail 'legacy Web image cache path could not be derived safely'

export \
  PRESSLY_CLEAN_EPOCH_LEGACY_WEB_CACHE_PATH="$LEGACY_WEB_CACHE_PATH" \
  PRESSLY_RELEASE_SHA="$TARGET_SHA" \
  PRESSLY_API_IMAGE="$TARGET_API_IMAGE" \
  PRESSLY_WEB_IMAGE="$TARGET_WEB_IMAGE" \
  PRESSLY_WORKER_IMAGE="$TARGET_WORKER_IMAGE" \
  PRESSLY_PROCESSOR_IMAGE="$TARGET_PROCESSOR_IMAGE" \
  PRESSLY_CONTROL_IMAGE="$TARGET_CONTROL_IMAGE"

verify_backup
if [[ ! "$EXPECTED_PUBLIC_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  fail 'PRESSLY_EXPECTED_PUBLIC_IP must be an exact IPv4 address'
fi
IFS=. read -r ip_a ip_b ip_c ip_d <<< "$EXPECTED_PUBLIC_IP"
for octet in "$ip_a" "$ip_b" "$ip_c" "$ip_d"; do
  ((10#$octet <= 255)) || fail 'PRESSLY_EXPECTED_PUBLIC_IP must be an exact IPv4 address'
done

ensure_postgres_ready
topology="$(classify_topology "$(database_topology)")"
assert_phase_topology "$topology"
admission="$(release_admission)"
echo "Clean-epoch recovery phase: $CUTOVER_PHASE"
echo "Database topology: $topology"
echo "Release admission: $admission"
echo "Required confirmation: $EXPECTED_CONFIRM"

if [[ "$MODE" == --preflight-only ]]; then
  echo 'Clean database epoch recovery preflight passed; no cutover state changed.'
  exit 0
fi
[[ "$EXPECTED_LEGACY_SHA" == "$LEGACY_SHA" ]] ||
  fail 'PRESSLY_CLEAN_EPOCH_EXPECTED_LEGACY_SHA must exactly match the journal'
[[ "$EXPECTED_TARGET_SHA" == "$TARGET_SHA" ]] ||
  fail 'PRESSLY_CLEAN_EPOCH_EXPECTED_TARGET_SHA must exactly match the journal'
[[ "$RECOVERY_CONFIRM" == "$EXPECTED_CONFIRM" ]] ||
  fail 'clean-epoch recovery confirmation is absent or incorrect'
[[ -x "$ROLLBACK_SCRIPT" ]] || fail "exact recovery rollback entrypoint is missing: $ROLLBACK_SCRIPT"

if [[ "$CUTOVER_PHASE" == aborted ]]; then
  [[ "$admission" == legacy_verified ]] ||
    fail 'aborted evidence exists but the legacy release is not verified'
  assert_legacy_database "$TARGET_DATABASE"
  start_and_verify_legacy_runtime
  lift_service_fence
  recovery_complete=true
  echo "Clean database epoch was already recovered to legacy release: $LEGACY_SHA"
  exit 0
fi

STATE_FILE="$CUTOVER_JOURNAL_FILE"
journal_operation write aborting >/dev/null
CUTOVER_PHASE=aborting
recovery_started=true
kill_after after_aborting

fence_services
kill_after after_fence
ensure_postgres_ready
restore_legacy_topology
restore_runtime_connect
kill_after after_legacy_database_restored

admission="$(release_admission)"
if [[ "$admission" == rollback_required ]]; then
  PRESSLY_CLEAN_EPOCH_RECOVERY=true \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_SHA="$LEGACY_SHA" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_API_IMAGE="$LEGACY_API_IMAGE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WEB_IMAGE="$LEGACY_WEB_IMAGE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_WORKER_IMAGE="$LEGACY_WORKER_IMAGE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_PROCESSOR_IMAGE="$LEGACY_PROCESSOR_IMAGE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_EXPECTED_LEGACY_CONTROL_IMAGE="$LEGACY_CONTROL_IMAGE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_DEPLOY_JOURNAL_FILE="$APP_ROOT/postgres-clean-epoch-deploy-bypass" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_COMPOSE_FILE="$COMPOSE_FILE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_COMPOSE_OVERRIDE_FILE="$LEGACY_COMPOSE_OVERRIDE_FILE" \
  PRESSLY_CLEAN_EPOCH_RECOVERY_FENCE_FILE="$SERVICE_FENCE_FILE" \
  PRESSLY_CLEAN_EPOCH_JOURNAL_FILE="$CUTOVER_JOURNAL_FILE" \
    "$ROLLBACK_SCRIPT"
elif [[ "$admission" != legacy_verified ]]; then
  fail "unexpected legacy release admission: $admission"
fi
kill_after after_legacy_rollback

assert_legacy_database "$TARGET_DATABASE"
start_and_verify_legacy_runtime
commit_legacy_release
[[ "$(release_admission)" == legacy_verified ]] ||
  fail 'legacy release rollback did not commit exact verified deployment state'
kill_after after_legacy_verified

journal_operation abort aborted >/dev/null
kill_after after_journal_retired
lift_service_fence
recovery_complete=true

echo "Clean database epoch recovery completed: $CUTOVER_ID"
echo "Restored legacy release: $LEGACY_SHA"
echo "Retained clean database: $CANDIDATE_DATABASE"
