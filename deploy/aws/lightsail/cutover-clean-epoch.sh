#!/usr/bin/env bash
set -euo pipefail
umask 077

MODE="${1:-}"
case "$MODE" in
  prepare|mark-public-verified|finalize|fail-safe) ;;
  *)
    echo "Usage: cutover-clean-epoch.sh prepare|mark-public-verified|finalize|fail-safe" >&2
    exit 2
    ;;
esac

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
MIGRATION_ENV_FILE="${PRESSLY_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
ROLE_ENV_FILE="${PRESSLY_DATABASE_ROLES_ENV_FILE:-$ENV_DIR/database-roles.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/deploy/aws/lightsail/docker-compose.production.yml}"
ROLE_SQL="${PRESSLY_DATABASE_ROLES_SQL:-$REPO_DIR/deploy/postgres/configure-roles.sql}"
DECLARATION_FILE="${PRESSLY_CLEAN_EPOCH_DECLARATION:-$REPO_DIR/deploy/aws/lightsail/clean-epoch-cutover.json}"
DEPLOY_TOOLING_FILE="${PRESSLY_DEPLOY_TOOLING_FILE:-$REPO_DIR/deploy/aws/lightsail/deployment-tooling.mjs}"
BACKUP_SCRIPT="${PRESSLY_CLEAN_EPOCH_BACKUP_SCRIPT:-$REPO_DIR/deploy/aws/lightsail/backup-postgres.sh}"
RESTORE_DRILL_SCRIPT="${PRESSLY_CLEAN_EPOCH_RESTORE_DRILL_SCRIPT:-$REPO_DIR/deploy/aws/lightsail/restore-postgres-drill.sh}"
PREPARE_TOOL="${PRESSLY_CLEAN_EPOCH_PREPARE_TOOL:-tooling/postgres/prepare-clean-epoch-candidate.ts}"
BACKUP_DIR="${PRESSLY_BACKUP_DIR:-$APP_ROOT/backups/postgres}"
DEPLOY_LOCK_FILE="${PRESSLY_DEPLOY_LOCK_FILE:-$APP_ROOT/deploy.lock}"
OPERATION_LOCK_DIR="${PRESSLY_OPERATION_LOCK_DIR:-$APP_ROOT/run}"
BACKUP_LOCK_FILE="$OPERATION_LOCK_DIR/postgres-backup.lock"
RESTORE_JOURNAL_FILE="${PRESSLY_RESTORE_JOURNAL_FILE:-$APP_ROOT/postgres-restore.json}"
CUTOVER_JOURNAL_FILE="${PRESSLY_CLEAN_EPOCH_JOURNAL_FILE:-$APP_ROOT/postgres-clean-epoch.json}"
CUTOVER_EVIDENCE_FILE="${PRESSLY_CLEAN_EPOCH_EVIDENCE_FILE:-$APP_ROOT/postgres-clean-epoch-last.json}"
SERVICE_FENCE_FILE="${PRESSLY_CLEAN_EPOCH_FENCE_FILE:-$APP_ROOT/postgres-clean-epoch-fence.compose.yml}"
CURRENT_RELEASE_METADATA_FILE="${PRESSLY_CURRENT_RELEASE_METADATA_FILE:-$APP_ROOT/current-release.json}"
PREVIOUS_RELEASE_METADATA_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
CUTOVER_CONFIRM="${PRESSLY_CLEAN_EPOCH_CONFIRM:-}"

fail() {
  echo "Clean database epoch cutover failed: $*" >&2
  exit 1
}

for command in docker flock node sed seq sha256sum sleep stat; do
  command -v "$command" >/dev/null || fail "missing required command: $command"
done
for file in \
  "$COMPOSE_ENV_FILE" \
  "$POSTGRES_ENV_FILE" \
  "$MIGRATION_ENV_FILE" \
  "$ROLE_ENV_FILE"; do
  [[ -f "$file" && "$(stat -c '%a' "$file")" == 600 ]] ||
    fail "expected a mode-600 environment file: $file"
done
for file in \
  "$COMPOSE_FILE" \
  "$ROLE_SQL" \
  "$DECLARATION_FILE" \
  "$DEPLOY_TOOLING_FILE" \
  "$BACKUP_SCRIPT" \
  "$RESTORE_DRILL_SCRIPT"; do
  [[ -f "$file" ]] || fail "missing required cutover file: $file"
done
[[ ! -e "$RESTORE_JOURNAL_FILE" && ! -L "$RESTORE_JOURNAL_FILE" ]] ||
  fail "active Postgres restore journal blocks clean-epoch cutover: $RESTORE_JOURNAL_FILE"

if [[ "${PRESSLY_DEPLOY_LOCK_HELD:-}" == 1 ]]; then
  flock -n 9 || fail 'inherited deployment lock is invalid'
else
  exec 9> "$DEPLOY_LOCK_FILE"
  flock -n 9 || {
    echo 'Another deployment, rollback, restore, or cutover is in progress.' >&2
    exit 75
  }
  export PRESSLY_DEPLOY_LOCK_HELD=1
fi
mkdir -p "$OPERATION_LOCK_DIR"
chmod 700 "$OPERATION_LOCK_DIR"
exec 8> "$BACKUP_LOCK_FILE"
if ! flock --nonblock 8; then
  echo 'Another Postgres backup, restore, or cutover is already running.' >&2
  exit 75
fi
export PRESSLY_BACKUP_LOCK_HELD=true

set -a
# shellcheck disable=SC1090
source "$POSTGRES_ENV_FILE"
# shellcheck disable=SC1090
source "$MIGRATION_ENV_FILE"
# shellcheck disable=SC1090
source "$ROLE_ENV_FILE"
set +a

: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${PRESSLY_MIGRATION_PASSWORD:?PRESSLY_MIGRATION_PASSWORD is required}"
: "${PRESSLY_RUNTIME_PASSWORD:?PRESSLY_RUNTIME_PASSWORD is required}"
: "${PRESSLY_BACKUP_PASSWORD:?PRESSLY_BACKUP_PASSWORD is required}"
: "${PRESSLY_BACKUP_S3_URI:?PRESSLY_BACKUP_S3_URI is required}"
: "${PRESSLY_BACKUP_SECONDARY_S3_URI:?PRESSLY_BACKUP_SECONDARY_S3_URI is required}"
: "${PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER:?PRESSLY_BACKUP_SECONDARY_AWS_EXPECTED_BUCKET_OWNER is required}"
: "${PRESSLY_RELEASE_SHA:?PRESSLY_RELEASE_SHA is required}"
: "${PRESSLY_API_IMAGE:?PRESSLY_API_IMAGE is required}"
: "${PRESSLY_WEB_IMAGE:?PRESSLY_WEB_IMAGE is required}"
: "${PRESSLY_WORKER_IMAGE:?PRESSLY_WORKER_IMAGE is required}"
: "${PRESSLY_PROCESSOR_IMAGE:?PRESSLY_PROCESSOR_IMAGE is required}"
: "${PRESSLY_CONTROL_IMAGE:?PRESSLY_CONTROL_IMAGE is required}"

[[ "$POSTGRES_DB" =~ ^[A-Za-z_][A-Za-z0-9_]{0,62}$ ]] ||
  fail 'POSTGRES_DB must be a valid PostgreSQL identifier'
case "$POSTGRES_DB" in
  postgres|template0|template1) fail "refusing system database: $POSTGRES_DB" ;;
esac
[[ "$POSTGRES_DB" == pressly ]] ||
  fail 'the one-time clean epoch is bound to the pressly production database'

json_field() {
  node "$DEPLOY_TOOLING_FILE" json-file-field "$1" "$2"
}

CUTOVER_ID="$(json_field "$DECLARATION_FILE" cutoverId)"
LEGACY_RELEASE_SHA="$(json_field "$DECLARATION_FILE" legacyReleaseSha)"
LEGACY_LEDGER_SHA256="$(json_field "$DECLARATION_FILE" legacyLedgerSha256)"
TARGET_JOURNAL_SHA256="$(json_field "$DECLARATION_FILE" targetJournalSha256)"
TARGET_TREE_SHA256="$(json_field "$DECLARATION_FILE" targetTreeSha256)"
if [[
  ! -f "$PREVIOUS_RELEASE_METADATA_FILE" ||
  -L "$PREVIOUS_RELEASE_METADATA_FILE" ||
  "$(stat -c '%a' "$PREVIOUS_RELEASE_METADATA_FILE")" != 600
]]; then
  fail "legacy release metadata must be a mode-600 regular file: $PREVIOUS_RELEASE_METADATA_FILE"
fi
LEGACY_SOURCE_SHA="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" sourceSha)"
LEGACY_API_IMAGE="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" apiImage)"
LEGACY_WEB_IMAGE="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" webImage)"
LEGACY_WORKER_IMAGE="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" workerImage)"
LEGACY_PROCESSOR_IMAGE="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" processorImage)"
LEGACY_CONTROL_IMAGE="$(json_field "$PREVIOUS_RELEASE_METADATA_FILE" controlImage)"
[[ "$LEGACY_SOURCE_SHA" == "$LEGACY_RELEASE_SHA" ]] ||
  fail 'previous release metadata does not match the declared legacy release'
EXPECTED_CONFIRM="CUTOVER:$CUTOVER_ID:$LEGACY_RELEASE_SHA:$PRESSLY_RELEASE_SHA"

if [[ "$MODE" != fail-safe && "$CUTOVER_CONFIRM" != "$EXPECTED_CONFIRM" ]]; then
  echo 'Clean-epoch confirmation is absent or incorrect.' >&2
  echo "Required confirmation: $EXPECTED_CONFIRM" >&2
  exit 2
fi

export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"
export PRESSLY_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE"

compose() {
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

postgres_exec() {
  compose exec -T postgres "$@"
}

configure_roles() {
  local database="$1"
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$database" \
    -v database_name="$database" \
    -v migration_password="$PRESSLY_MIGRATION_PASSWORD" \
    -v runtime_password="$PRESSLY_RUNTIME_PASSWORD" \
    -v backup_password="$PRESSLY_BACKUP_PASSWORD" \
    -f - < "$ROLE_SQL"
}

verify_database_roles() {
  local summary
  summary="$(
    postgres_exec psql \
      -v ON_ERROR_STOP=1 \
      -U "$POSTGRES_USER" \
      -d "$POSTGRES_DB" \
      -AtF '|' <<'SQL'
SELECT
  (
    SELECT count(*)
    FROM pg_roles
    WHERE rolname IN ('pressly_migration', 'pressly_runtime', 'pressly_backup')
      AND rolcanlogin
      AND NOT rolsuper
      AND NOT rolcreatedb
      AND NOT rolcreaterole
      AND NOT rolreplication
      AND NOT rolbypassrls
  ),
  (
    SELECT count(*)
    FROM pg_roles
    WHERE rolname IN ('pressly_migration', 'pressly_runtime', 'pressly_backup')
  ),
  (
    SELECT pg_get_userbyid(datdba)
    FROM pg_database
    WHERE datname = current_database()
  ),
  (
    SELECT count(*)
    FROM pg_namespace
    WHERE nspname IN ('public', 'drizzle')
      AND pg_get_userbyid(nspowner) <> 'pressly_migration'
  ),
  (
    SELECT count(*)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname IN ('public', 'drizzle')
      AND relation.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND pg_get_userbyid(relation.relowner) <> 'pressly_migration'
  ),
  (
    SELECT count(*)
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    WHERE namespace.nspname IN ('public', 'drizzle')
      AND pg_get_userbyid(procedure.proowner) <> 'pressly_migration'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend dependency
        WHERE dependency.classid = 'pg_proc'::regclass
          AND dependency.objid = procedure.oid
          AND dependency.deptype = 'e'
      )
  ),
  (
    SELECT count(*)
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'public'
      AND type.typtype IN ('d', 'e')
      AND pg_get_userbyid(type.typowner) <> 'pressly_migration'
  ),
  (
    SELECT count(*)
    FROM pg_extension
    WHERE extname IN ('pgcrypto', 'btree_gist')
      AND pg_get_userbyid(extowner) <> 'pressly_migration'
  ),
  has_schema_privilege('pressly_runtime', 'public', 'CREATE'),
  has_schema_privilege('pressly_backup', 'public', 'CREATE'),
  EXISTS (
    SELECT 1
    FROM pg_db_role_setting setting
    JOIN pg_roles role ON role.oid = setting.setrole
    JOIN pg_database database ON database.oid = setting.setdatabase
    WHERE role.rolname = 'pressly_backup'
      AND database.datname = current_database()
      AND 'default_transaction_read_only=on' = ANY(setting.setconfig)
  );
SQL
  )"
  [[ "$summary" == '3|3|pressly_migration|0|0|0|0|0|f|f|t' ]] ||
    fail "database role or ownership verification failed: $summary"

  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" >/dev/null <<'SQL'
BEGIN;
SET LOCAL ROLE pressly_runtime;
SELECT count(*) >= 0 FROM public.auth_identities;
UPDATE public.auth_login_attempts SET email_normalized = email_normalized WHERE false;
ROLLBACK;
BEGIN;
SET LOCAL ROLE pressly_backup;
SELECT count(*) >= 0 FROM public.auth_identities;
SELECT count(*) >= 0 FROM drizzle.__drizzle_migrations;
ROLLBACK;
SQL

  if postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE pressly_runtime;
CREATE TABLE public.pressly_clean_epoch_runtime_ddl_probe (id integer);
ROLLBACK;
SQL
  then
    fail 'runtime role unexpectedly created a schema object'
  fi
  if postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d "$POSTGRES_DB" >/dev/null 2>&1 <<'SQL'
BEGIN;
SET LOCAL ROLE pressly_backup;
DELETE FROM public.auth_login_attempts WHERE false;
ROLLBACK;
SQL
  then
    fail 'backup role unexpectedly executed a write statement'
  fi
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
      fail "$service is still running after the clean-epoch fence"
    fi
  done
  if [[ -n "$(compose ps --all --quiet migrate backup restore)" ]]; then
    fail 'a one-off database tooling container survived the clean-epoch fence'
  fi
}

lift_service_fence() {
  local container_id
  local policy
  for service in api worker caddy; do
    container_id="$(compose ps -q "$service")"
    [[ -n "$container_id" ]] ||
      fail "cannot lift clean-epoch fence without a running $service container"
    docker update --restart=unless-stopped "$container_id" >/dev/null
    policy="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")"
    [[ "$policy" == unless-stopped ]] ||
      fail "$service restart policy remains $policy"
  done
  node "$DEPLOY_TOOLING_FILE" remove-service-fence "$SERVICE_FENCE_FILE"
}

BACKUP_BASENAME=''
BACKUP_SHA256=''
CANDIDATE_DATABASE=''
QUARANTINE_DATABASE=''
PRICING_SHA256='-'
CUTOVER_PHASE=''

journal_operation() {
  local action="$1"
  local phase="$2"
  local pricing_sha256="$3"
  node "$DEPLOY_TOOLING_FILE" clean-epoch-journal-operation \
    "$CUTOVER_JOURNAL_FILE" \
    "$CUTOVER_EVIDENCE_FILE" \
    "$action" \
    "$CUTOVER_ID" \
    "$LEGACY_SOURCE_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    "$LEGACY_LEDGER_SHA256" \
    "$BACKUP_BASENAME" \
    "$BACKUP_SHA256" \
    "$PRESSLY_RELEASE_SHA" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" \
    "$PRESSLY_CONTROL_IMAGE" \
    "$TARGET_JOURNAL_SHA256" \
    "$TARGET_TREE_SHA256" \
    "$POSTGRES_DB" \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE" \
    "$phase" \
    "$pricing_sha256"
}

load_or_start_journal() {
  local journal_result
  local backup_file
  local backup_output
  local stamp

  if [[ -e "$CUTOVER_JOURNAL_FILE" || -L "$CUTOVER_JOURNAL_FILE" ]]; then
    [[ ! -L "$CUTOVER_JOURNAL_FILE" ]] || fail 'clean-epoch journal cannot be a symlink'
    BACKUP_BASENAME="$(json_field "$CUTOVER_JOURNAL_FILE" backupBasename)"
    BACKUP_SHA256="$(json_field "$CUTOVER_JOURNAL_FILE" backupSha256)"
    CANDIDATE_DATABASE="$(json_field "$CUTOVER_JOURNAL_FILE" candidateDatabase)"
    QUARANTINE_DATABASE="$(json_field "$CUTOVER_JOURNAL_FILE" quarantineDatabase)"
  else
    [[ "$MODE" == prepare ]] || fail 'clean-epoch journal is absent'
    [[ -f "$CURRENT_RELEASE_METADATA_FILE" ]] ||
      fail 'current release metadata is missing'
    [[ "$(json_field "$CURRENT_RELEASE_METADATA_FILE" sourceSha)" == "$LEGACY_RELEASE_SHA" ]] ||
      fail 'current release is not the declared legacy release'

    backup_output="$(
      PRESSLY_BACKUP_LOCAL_ONLY=false \
      PRESSLY_BACKUP_DIR="$BACKUP_DIR" \
      "$BACKUP_SCRIPT"
    )"
    printf '%s\n' "$backup_output"
    backup_file="$(sed -n 's/^Backup file: //p' <<< "$backup_output")"
    [[ "$backup_file" == "$BACKUP_DIR"/pressly-*.dump.gpg && -f "$backup_file" ]] ||
      fail 'local cutover backup path is invalid'
    "$RESTORE_DRILL_SCRIPT" "$backup_file"
    BACKUP_BASENAME="$(basename "$backup_file")"
    BACKUP_SHA256="$(sha256sum "$backup_file" | cut -d' ' -f1)"
    stamp="$(date -u +%Y%m%d%H%M%S)"
    CANDIDATE_DATABASE="${POSTGRES_DB:0:24}_epoch_candidate_${stamp}_$$"
    QUARANTINE_DATABASE="${POSTGRES_DB:0:24}_epoch_legacy_${stamp}_$$"
  fi

  journal_result="$(journal_operation start preparing -)"
  mapfile -t journal_fields <<< "$journal_result"
  [[ "${#journal_fields[@]}" == 4 ]] || fail 'clean-epoch journal returned invalid bindings'
  CUTOVER_PHASE="${journal_fields[0]}"
  CANDIDATE_DATABASE="${journal_fields[1]}"
  QUARANTINE_DATABASE="${journal_fields[2]}"
  PRICING_SHA256="${journal_fields[3]}"
}

write_phase() {
  local phase="$1"
  local pricing_sha256="${2:-$PRICING_SHA256}"
  journal_operation write "$phase" "$pricing_sha256" >/dev/null
  CUTOVER_PHASE="$phase"
  PRICING_SHA256="$pricing_sha256"
}

database_topology() {
  postgres_exec psql \
    -v ON_ERROR_STOP=1 \
    -U "$POSTGRES_USER" \
    -d postgres \
    -AtF '|' \
    -v target_database="$POSTGRES_DB" \
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
    '1|1|0') echo candidate_ready ;;
    '0|1|1') echo legacy_quarantined ;;
    '1|0|1') echo candidate_promoted ;;
    *) fail "unsafe clean-epoch database topology: $1" ;;
  esac
}

assert_phase_topology() {
  case "$CUTOVER_PHASE:$1" in
    preparing:target_only|preparing:candidate_ready|candidate_ready:candidate_ready|candidate_ready:legacy_quarantined|legacy_quarantined:legacy_quarantined|legacy_quarantined:candidate_promoted|candidate_promoted:candidate_promoted|validated:candidate_promoted|public_verified:candidate_promoted) ;;
    *) fail "clean-epoch phase $CUTOVER_PHASE conflicts with topology $1" ;;
  esac
}

prepare_candidate() {
  local output
  local pricing_sha256
  postgres_exec createdb \
    -U "$POSTGRES_USER" \
    --template=template0 \
    --owner=pressly_migration \
    "$CANDIDATE_DATABASE"
  configure_roles "$CANDIDATE_DATABASE"
  output="$(
    compose --profile tools run --rm -T \
      --workdir /repo \
      -e PRESSLY_CLEAN_EPOCH_SOURCE_DATABASE="$POSTGRES_DB" \
      -e PRESSLY_CLEAN_EPOCH_TARGET_DATABASE="$CANDIDATE_DATABASE" \
      -e PRESSLY_CLEAN_EPOCH_DECLARATION=/repo/deploy/aws/lightsail/clean-epoch-cutover.json \
      migrate node --import tsx "$PREPARE_TOOL" prepare
  )"
  printf '%s\n' "$output"
  pricing_sha256="$(
    sed -n 's/.*"pricingSha256":"\([0-9a-f]\{64\}\)".*/\1/p' <<< "$output"
  )"
  [[ "$pricing_sha256" =~ ^[0-9a-f]{64}$ ]] ||
    fail 'candidate preparation did not report a canonical Pricing digest'
  configure_roles "$CANDIDATE_DATABASE"
  write_phase candidate_ready "$pricing_sha256"
}

verify_promoted() {
  local output
  local pricing_sha256
  output="$(
    compose --profile tools run --rm -T \
      --workdir /repo \
      -e PRESSLY_CLEAN_EPOCH_SOURCE_DATABASE="$QUARANTINE_DATABASE" \
      -e PRESSLY_CLEAN_EPOCH_TARGET_DATABASE="$POSTGRES_DB" \
      -e PRESSLY_CLEAN_EPOCH_EXPECTED_PRICING_SHA256="$PRICING_SHA256" \
      -e PRESSLY_CLEAN_EPOCH_DECLARATION=/repo/deploy/aws/lightsail/clean-epoch-cutover.json \
      migrate node --import tsx "$PREPARE_TOOL" verify
  )"
  printf '%s\n' "$output"
  pricing_sha256="$(
    sed -n 's/.*"pricingSha256":"\([0-9a-f]\{64\}\)".*/\1/p' <<< "$output"
  )"
  [[ "$pricing_sha256" == "$PRICING_SHA256" ]] ||
    fail 'promoted Pricing digest differs from the journaled candidate'
}

promote_candidate() {
  local topology
  topology="$(classify_topology "$(database_topology)")"
  assert_phase_topology "$topology"

  if [[ "$topology" == candidate_ready ]]; then
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" \
      -v candidate_database="$CANDIDATE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN (:'target_database', :'candidate_database')
  AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'target_database') \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'candidate_database') \gexec
SQL
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" \
      -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'target_database',
  :'quarantine_database'
) \gexec
SQL
    write_phase legacy_quarantined
    topology=legacy_quarantined
  fi

  if [[ "$topology" == legacy_quarantined ]]; then
    [[ "$CUTOVER_PHASE" == legacy_quarantined ]] ||
      write_phase legacy_quarantined
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v candidate_database="$CANDIDATE_DATABASE" \
      -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'candidate_database',
  :'target_database'
) \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SQL
    write_phase candidate_promoted
    topology=candidate_promoted
  fi

  if [[ "$topology" == candidate_promoted ]]; then
    postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
      -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SQL
    if [[ "$CUTOVER_PHASE" == candidate_ready ]]; then
      write_phase legacy_quarantined
      write_phase candidate_promoted
    elif [[ "$CUTOVER_PHASE" == legacy_quarantined ]]; then
      write_phase candidate_promoted
    fi
    if [[ "$CUTOVER_PHASE" == candidate_promoted ]]; then
      configure_roles "$POSTGRES_DB"
      verify_database_roles
      verify_promoted
      write_phase validated
    fi
  fi
}

load_or_start_journal

case "$MODE" in
  fail-safe)
    fence_services
    echo 'Clean-epoch cutover remains fenced for exact recovery.'
    exit 0
    ;;
  mark-public-verified)
    [[ "$CUTOVER_PHASE" == validated || "$CUTOVER_PHASE" == public_verified ]] ||
      fail "cannot verify public runtime from phase $CUTOVER_PHASE"
    if [[ "$CUTOVER_PHASE" == validated ]]; then
      write_phase public_verified
    fi
    lift_service_fence
    echo 'Clean-epoch public runtime verified; journal retained until release commit.'
    exit 0
    ;;
  finalize)
    [[ "$CUTOVER_PHASE" == public_verified ]] ||
      fail "cannot finalize clean epoch from phase $CUTOVER_PHASE"
    journal_operation complete public_verified "$PRICING_SHA256" >/dev/null
    echo "Clean database epoch cutover completed: $CUTOVER_ID"
    echo "Legacy database retained: $QUARANTINE_DATABASE"
    echo "Pricing SHA-256: $PRICING_SHA256"
    exit 0
    ;;
esac

fence_services
compose up -d postgres
postgres_ready=false
for _ in $(seq 1 30); do
  if postgres_exec pg_isready -U "$POSTGRES_USER" -d postgres >/dev/null 2>&1; then
    postgres_ready=true
    break
  fi
  sleep 1
done
[[ "$postgres_ready" == true ]] || fail 'Postgres did not become ready for cutover recovery'

topology="$(classify_topology "$(database_topology)")"
assert_phase_topology "$topology"
if [[ "$CUTOVER_PHASE" == preparing ]]; then
  if [[ "$topology" == candidate_ready ]]; then
    postgres_exec dropdb -U "$POSTGRES_USER" --if-exists --force "$CANDIDATE_DATABASE"
    topology=target_only
  fi
  [[ "$topology" == target_only ]] ||
    fail "cannot prepare clean candidate from topology $topology"
  postgres_exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
    -v target_database="$POSTGRES_DB" <<'SQL'
SELECT format('REVOKE CONNECT ON DATABASE %I FROM pressly_runtime', :'target_database') \gexec
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'target_database'
  AND pid <> pg_backend_pid();
SQL
  prepare_candidate
fi

promote_candidate
[[ "$CUTOVER_PHASE" == validated || "$CUTOVER_PHASE" == public_verified ]] ||
  fail "clean epoch stopped in unexpected phase $CUTOVER_PHASE"
echo "Clean database epoch candidate promoted and validated: $CUTOVER_ID"
echo "Legacy database retained: $QUARANTINE_DATABASE"
echo "Pricing SHA-256: $PRICING_SHA256"
