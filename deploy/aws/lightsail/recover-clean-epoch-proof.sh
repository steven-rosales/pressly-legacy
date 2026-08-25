#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
RECOVERY_SCRIPT="$ROOT_DIR/deploy/aws/lightsail/recover-clean-epoch.sh"
ROLLBACK_SCRIPT="$ROOT_DIR/deploy/aws/lightsail/rollback.sh"
DEPLOY_TOOLING_FILE="$ROOT_DIR/deploy/aws/lightsail/deployment-tooling.mjs"
DECLARATION_FILE="$ROOT_DIR/deploy/aws/lightsail/clean-epoch-cutover.json"
LEGACY_OVERRIDE_FILE="$ROOT_DIR/deploy/aws/lightsail/clean-epoch-legacy-compose.override.yml"
TOOLING_ERROR_FACTORY="$ROOT_DIR/platform/errors/src/tooling-error.mjs"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'
ALPINE_IMAGE='alpine:3.23.3@sha256:25109184c71bdad752c8312a8623239686a9a2071e8825f20acb8f2198c3f659'
LEGACY_SHA='f0d38b7d6b8a5576f62760bd984439def4351a1e'
TARGET_SHA="$(git -C "$ROOT_DIR" rev-parse --verify HEAD)"
PROJECT_NAME="${PRESSLY_CLEAN_EPOCH_PROOF_PROJECT:-pressly-clean-epoch-proof-$(id -u)-$$}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-clean-epoch-proof.XXXXXX")"
APP_ROOT="$WORK_DIR/app"
REPO_DIR="$WORK_DIR/repo"
ENV_DIR="$APP_ROOT/env"
BACKUP_DIR="$APP_ROOT/backups/postgres"
BIN_DIR="$WORK_DIR/bin"
COMPOSE_FILE="$WORK_DIR/compose.yml"
COMPOSE_ENV_FILE="$ENV_DIR/compose.env"
POSTGRES_ENV_FILE="$ENV_DIR/postgres.env"
OPS_SOURCE_SHA_FILE="$WORK_DIR/source-sha"
JOURNAL_FILE="$APP_ROOT/postgres-clean-epoch.json"
EVIDENCE_FILE="$APP_ROOT/postgres-clean-epoch-last.json"
FENCE_FILE="$APP_ROOT/postgres-clean-epoch-fence.compose.yml"
CURRENT_RELEASE_FILE="$APP_ROOT/current-release"
CURRENT_METADATA_FILE="$APP_ROOT/current-release.json"
PREVIOUS_METADATA_FILE="$APP_ROOT/previous-release.json"
DEPLOYMENT_STATE_FILE="$APP_ROOT/deployment-state.json"
BACKUP_FILE="$BACKUP_DIR/pressly-20260825T060000Z.dump.gpg"
APP_IMAGE="$PROJECT_NAME-app:proof"
REAL_DOCKER="$(command -v docker)"

digest() {
  local value=''
  for _ in {1..64}; do
    value+="$1"
  done
  printf '%s' "$value"
}

LEGACY_API_IMAGE="ghcr.io/pressly-proof/pressly-api@sha256:$(digest 1)"
LEGACY_WEB_IMAGE="ghcr.io/pressly-proof/pressly-web@sha256:$(digest 2)"
LEGACY_WORKER_IMAGE="ghcr.io/pressly-proof/pressly-worker@sha256:$(digest 3)"
LEGACY_PROCESSOR_IMAGE="ghcr.io/pressly-proof/pressly-processor@sha256:$(digest 4)"
LEGACY_CONTROL_IMAGE="ghcr.io/pressly-proof/pressly-control@sha256:$(digest 5)"
TARGET_API_IMAGE="ghcr.io/pressly-proof/pressly-api@sha256:$(digest 6)"
TARGET_WEB_IMAGE="ghcr.io/pressly-proof/pressly-web@sha256:$(digest 7)"
TARGET_WORKER_IMAGE="ghcr.io/pressly-proof/pressly-worker@sha256:$(digest 8)"
TARGET_PROCESSOR_IMAGE="ghcr.io/pressly-proof/pressly-processor@sha256:$(digest 9)"
TARGET_CONTROL_IMAGE="ghcr.io/pressly-proof/pressly-control@sha256:$(digest a)"
LEGACY_LEDGER_SHA256="$(
  node "$DEPLOY_TOOLING_FILE" json-file-field "$DECLARATION_FILE" legacyLedgerSha256
)"
TARGET_JOURNAL_SHA256="$(
  node "$DEPLOY_TOOLING_FILE" json-file-field "$DECLARATION_FILE" targetJournalSha256
)"
TARGET_TREE_SHA256="$(
  node "$DEPLOY_TOOLING_FILE" json-file-field "$DECLARATION_FILE" targetTreeSha256
)"
BACKUP_SHA256=''
CANDIDATE_DATABASE='pressly_epoch_candidate_20260825060000_1234'
QUARANTINE_DATABASE='pressly_epoch_legacy_20260825060000_1234'
EXPECTED_CONFIRM="RECOVER_CLEAN_EPOCH:clean-owner-epoch-v1:$LEGACY_SHA:$TARGET_SHA"
BUILT_APP_IMAGE=false

fail() {
  echo "Disposable clean-epoch recovery proof failed: $*" >&2
  exit 1
}

for command in docker git node sha256sum; do
  command -v "$command" >/dev/null || fail "$command is required"
done
[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ && "$TARGET_SHA" != "$LEGACY_SHA" ]] ||
  fail 'proof target must be a full non-legacy Git SHA'
[[ "$PROJECT_NAME" =~ ^pressly-clean-epoch-proof-[a-z0-9-]+$ ]] ||
  fail 'proof project name is unsafe'
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing a non-local DOCKER_HOST'
DOCKER_CONTEXT="$(docker context show)"
DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ "$DOCKER_ENDPOINT" == unix://* ]] || fail 'refusing a non-local Docker endpoint'

proof_compose() {
  PRESSLY_PROOF_PROJECT="$PROJECT_NAME" \
  PRESSLY_RELEASE_SHA="$LEGACY_SHA" \
  PRESSLY_API_IMAGE="$APP_IMAGE" \
  PRESSLY_WEB_IMAGE="$APP_IMAGE" \
  PRESSLY_WORKER_IMAGE="$APP_IMAGE" \
  PRESSLY_PROCESSOR_IMAGE="$APP_IMAGE" \
  PRESSLY_CONTROL_IMAGE="$APP_IMAGE" \
    "$REAL_DOCKER" compose \
      --env-file "$COMPOSE_ENV_FILE" \
      -f "$COMPOSE_FILE" \
      "$@"
}

cleanup() {
  local exit_code="$?"
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e
  if ((exit_code != 0)); then
    proof_compose ps >&2
    proof_compose logs --no-color --tail=100 postgres >&2
  fi
  proof_compose down --volumes --remove-orphans --timeout 10 >/dev/null ||
    cleanup_failed=true
  if [[ "$BUILT_APP_IMAGE" == true ]]; then
    "$REAL_DOCKER" image rm "$APP_IMAGE" >/dev/null 2>&1 || cleanup_failed=true
  fi
  rm -rf "$WORK_DIR" || cleanup_failed=true
  if [[ "$cleanup_failed" == true && "$exit_code" -eq 0 ]]; then
    exit 1
  fi
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

mkdir -p "$APP_ROOT" "$ENV_DIR" "$BACKUP_DIR" "$BIN_DIR"
chmod 700 "$APP_ROOT" "$ENV_DIR" "$BACKUP_DIR" "$BIN_DIR"
printf '\n' > "$COMPOSE_ENV_FILE"
printf 'POSTGRES_DB=pressly\nPOSTGRES_USER=postgres\n' > "$POSTGRES_ENV_FILE"
chmod 600 "$COMPOSE_ENV_FILE" "$POSTGRES_ENV_FILE"
printf '%s\n' "$TARGET_SHA" > "$OPS_SOURCE_SHA_FILE"
printf 'encrypted-proof-backup\n' > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
BACKUP_SHA256="$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)"

git clone --quiet --shared "$ROOT_DIR" "$REPO_DIR"
git -C "$REPO_DIR" checkout --quiet --detach "$TARGET_SHA"

DOCKERFILE="$WORK_DIR/Dockerfile"
cat > "$DOCKERFILE" <<EOF
FROM $ALPINE_IMAGE
RUN printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/node && chmod 755 /usr/local/bin/node
WORKDIR /app
HEALTHCHECK CMD ["/bin/true"]
CMD ["node", "historical/web/server.js"]
EOF
"$REAL_DOCKER" build \
  --quiet \
  --label "org.opencontainers.image.revision=$LEGACY_SHA" \
  -t "$APP_IMAGE" \
  -f "$DOCKERFILE" \
  "$WORK_DIR" >/dev/null
BUILT_APP_IMAGE=true

cat > "$COMPOSE_FILE" <<EOF
name: \${PRESSLY_PROOF_PROJECT:?PRESSLY_PROOF_PROJECT is required}
services:
  postgres:
    image: $POSTGRES_IMAGE
    restart: unless-stopped
    environment:
      POSTGRES_DB: pressly
      POSTGRES_USER: postgres
      POSTGRES_HOST_AUTH_METHOD: trust
    healthcheck:
      test: [CMD-SHELL, 'pg_isready -U postgres -d postgres']
      interval: 1s
      timeout: 3s
      retries: 30
    volumes:
      - postgres_data:/var/lib/postgresql
  caddy:
    image: \${PRESSLY_API_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: &app_health
      test: [CMD, /bin/true]
      interval: 1s
      timeout: 2s
      retries: 10
  api:
    image: \${PRESSLY_API_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: *app_health
  web:
    image: \${PRESSLY_WEB_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: *app_health
  worker:
    image: \${PRESSLY_WORKER_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: *app_health
  processor:
    image: \${PRESSLY_PROCESSOR_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: *app_health
  control:
    image: \${PRESSLY_CONTROL_IMAGE:?}
    restart: unless-stopped
    command: [sleep, infinity]
    healthcheck: *app_health
  migrate:
    profiles: [tools]
    image: \${PRESSLY_API_IMAGE:?}
    command: [sleep, infinity]
  backup:
    profiles: [tools]
    image: \${PRESSLY_API_IMAGE:?}
    command: [sleep, infinity]
  restore:
    profiles: [tools]
    image: \${PRESSLY_API_IMAGE:?}
    command: [sleep, infinity]
volumes:
  postgres_data:
EOF

cat > "$BIN_DIR/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
real_docker="${PRESSLY_PROOF_REAL_DOCKER:?}"
app_image="${PRESSLY_PROOF_APP_IMAGE:?}"
if [[ "${1:-}" == image && "${2:-}" == inspect ]]; then
  args=("$@")
  args[$((${#args[@]} - 1))]="$app_image"
  exec "$real_docker" "${args[@]}"
fi
if [[ "${1:-}" == inspect && "$*" == *'.Config.Image'* ]]; then
  container="${!#}"
  service="$(
    "$real_docker" inspect \
      --format '{{ index .Config.Labels "com.docker.compose.service" }}' \
      "$container"
  )"
  case "$service" in
    api) printf '%s\n' "$PRESSLY_PROOF_LEGACY_API_IMAGE" ;;
    web) printf '%s\n' "$PRESSLY_PROOF_LEGACY_WEB_IMAGE" ;;
    worker) printf '%s\n' "$PRESSLY_PROOF_LEGACY_WORKER_IMAGE" ;;
    processor) printf '%s\n' "$PRESSLY_PROOF_LEGACY_PROCESSOR_IMAGE" ;;
    control) printf '%s\n' "$PRESSLY_PROOF_LEGACY_CONTROL_IMAGE" ;;
    *) exec "$real_docker" "$@" ;;
  esac
  exit 0
fi
if [[ "${1:-}" == compose ]]; then
  for argument in "$@"; do
    if [[ "$argument" == pull ]]; then
      exit 0
    fi
  done
  export \
    PRESSLY_API_IMAGE="$app_image" \
    PRESSLY_WEB_IMAGE="$app_image" \
    PRESSLY_WORKER_IMAGE="$app_image" \
    PRESSLY_PROCESSOR_IMAGE="$app_image" \
    PRESSLY_CONTROL_IMAGE="$app_image"
fi
exec "$real_docker" "$@"
EOF

cat > "$BIN_DIR/getent" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${1:-}" == ahostsv4 && -n "${2:-}" ]]
printf '127.0.0.1 STREAM %s\n' "$2"
EOF

cat > "$BIN_DIR/curl" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
chmod 700 "$BIN_DIR/docker" "$BIN_DIR/getent" "$BIN_DIR/curl"

proof_compose up -d --wait postgres

admin_sql() {
  proof_compose exec -T postgres psql \
    -v ON_ERROR_STOP=1 \
    -U postgres \
    -d postgres \
    "$@"
}

reset_databases() {
  proof_compose stop caddy api web worker processor control >/dev/null 2>&1 || true
  admin_sql \
    -v target_database=pressly \
    -v candidate_database="$CANDIDATE_DATABASE" \
    -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname IN (:'target_database', :'candidate_database', :'quarantine_database')
  AND pid <> pg_backend_pid();
SELECT format('DROP DATABASE IF EXISTS %I', :'candidate_database') \gexec
SELECT format('DROP DATABASE IF EXISTS %I', :'quarantine_database') \gexec
SELECT format('DROP DATABASE IF EXISTS %I', :'target_database') \gexec
SELECT format('CREATE DATABASE %I', :'target_database') \gexec
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pressly_runtime') THEN
    CREATE ROLE pressly_runtime LOGIN;
  END IF;
END
$$;
SELECT format(
  'REVOKE CONNECT ON DATABASE %I FROM PUBLIC, pressly_runtime',
  :'target_database'
) \gexec
SQL
  node --input-type=module - "$DECLARATION_FILE" <<'NODE' |
import { readFileSync } from 'node:fs';
const declaration = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const tuples = declaration.legacy.entries
  .map((entry) => `(${entry.id}, '${entry.hash}', ${entry.createdAt})`)
  .join(',\n');
process.stdout.write(`
CREATE SCHEMA drizzle;
CREATE TABLE drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);
INSERT INTO drizzle.__drizzle_migrations (id, hash, created_at) VALUES
${tuples};
`);
NODE
    proof_compose exec -T postgres psql \
      -v ON_ERROR_STOP=1 -U postgres -d pressly >/dev/null
}

create_candidate() {
  admin_sql -v candidate_database="$CANDIDATE_DATABASE" <<'SQL'
SELECT format('CREATE DATABASE %I', :'candidate_database') \gexec
SQL
}

rename_legacy_to_quarantine() {
  admin_sql \
    -v target_database=pressly \
    -v quarantine_database="$QUARANTINE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'target_database' AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'target_database') \gexec
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'target_database',
  :'quarantine_database'
) \gexec
SQL
}

promote_candidate() {
  admin_sql \
    -v target_database=pressly \
    -v candidate_database="$CANDIDATE_DATABASE" <<'SQL'
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'candidate_database' AND pid <> pg_backend_pid();
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'candidate_database') \gexec
SELECT format(
  'ALTER DATABASE %I RENAME TO %I',
  :'candidate_database',
  :'target_database'
) \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'target_database') \gexec
SQL
}

journal_operation() {
  node "$DEPLOY_TOOLING_FILE" clean-epoch-journal-operation \
    "$JOURNAL_FILE" \
    "$EVIDENCE_FILE" \
    "$1" \
    clean-owner-epoch-v1 \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE" \
    "$LEGACY_LEDGER_SHA256" \
    "$(basename "$BACKUP_FILE")" \
    "$BACKUP_SHA256" \
    "$TARGET_SHA" \
    "$TARGET_API_IMAGE" \
    "$TARGET_WEB_IMAGE" \
    "$TARGET_WORKER_IMAGE" \
    "$TARGET_PROCESSOR_IMAGE" \
    "$TARGET_CONTROL_IMAGE" \
    "$TARGET_JOURNAL_SHA256" \
    "$TARGET_TREE_SHA256" \
    pressly \
    "$CANDIDATE_DATABASE" \
    "$QUARANTINE_DATABASE" \
    "$2" \
    "${3:--}" >/dev/null
}

advance_journal() {
  local phase="$1"
  journal_operation start preparing
  [[ "$phase" == preparing ]] && return
  journal_operation write candidate_ready "$(digest b)"
  [[ "$phase" == candidate_ready ]] && return
  journal_operation write legacy_quarantined
  [[ "$phase" == legacy_quarantined ]] && return
  journal_operation write candidate_promoted
  [[ "$phase" == candidate_promoted ]] && return
  journal_operation write validated
  [[ "$phase" == validated ]] && return
  journal_operation write public_verified
}

write_release_record() {
  local path="$1"
  local source_sha="$2"
  local api="$3"
  local web="$4"
  local worker="$5"
  local processor="$6"
  local control="$7"
  printf '{"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","deployedAt":"2026-08-25T06:00:00Z"}\n' \
    "$source_sha" "$api" "$web" "$worker" "$processor" "$control" > "$path"
}

write_deployment_state() {
  local source_sha="$1"
  local api="$2"
  local web="$3"
  local worker="$4"
  local processor="$5"
  local control="$6"
  local phase="$7"
  local outcome="$8"
  local exit_code="$9"
  printf '{"schemaVersion":1,"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","phase":"%s","outcome":"%s","exitCode":%s,"updatedAt":"2026-08-25T06:01:00Z"}\n' \
    "$source_sha" "$api" "$web" "$worker" "$processor" "$control" \
    "$phase" "$outcome" "$exit_code" > "$DEPLOYMENT_STATE_FILE"
}

prepare_case() {
  local residual="$1"
  local journal_phase
  rm -f "$JOURNAL_FILE" "$EVIDENCE_FILE" "$FENCE_FILE" \
    "$APP_ROOT/postgres-clean-epoch-deploy-bypass"
  git -C "$REPO_DIR" checkout --quiet --detach "$TARGET_SHA"
  reset_databases

  case "$residual" in
    preparing)
      journal_phase=preparing
      ;;
    candidate_ready)
      create_candidate
      journal_phase=candidate_ready
      ;;
    after_legacy_rename)
      create_candidate
      rename_legacy_to_quarantine
      journal_phase=candidate_ready
      ;;
    after_candidate_rename)
      create_candidate
      rename_legacy_to_quarantine
      promote_candidate
      journal_phase=legacy_quarantined
      ;;
    validated)
      create_candidate
      rename_legacy_to_quarantine
      promote_candidate
      journal_phase=validated
      ;;
    public_verified)
      create_candidate
      rename_legacy_to_quarantine
      promote_candidate
      journal_phase=public_verified
      ;;
    finalization|finalization_evidence|forward_pair_tear)
      create_candidate
      rename_legacy_to_quarantine
      promote_candidate
      journal_phase=public_verified
      ;;
    *) fail "unknown residual proof case: $residual" ;;
  esac
  advance_journal "$journal_phase"

  write_release_record \
    "$PREVIOUS_METADATA_FILE" \
    "$LEGACY_SHA" \
    "$LEGACY_API_IMAGE" \
    "$LEGACY_WEB_IMAGE" \
    "$LEGACY_WORKER_IMAGE" \
    "$LEGACY_PROCESSOR_IMAGE" \
    "$LEGACY_CONTROL_IMAGE"
  if [[ "$residual" == finalization || "$residual" == finalization_evidence ]]; then
    printf '%s\n' "$TARGET_SHA" > "$CURRENT_RELEASE_FILE"
    write_release_record \
      "$CURRENT_METADATA_FILE" \
      "$TARGET_SHA" \
      "$TARGET_API_IMAGE" \
      "$TARGET_WEB_IMAGE" \
      "$TARGET_WORKER_IMAGE" \
      "$TARGET_PROCESSOR_IMAGE" \
      "$TARGET_CONTROL_IMAGE"
    write_deployment_state \
      "$TARGET_SHA" \
      "$TARGET_API_IMAGE" \
      "$TARGET_WEB_IMAGE" \
      "$TARGET_WORKER_IMAGE" \
      "$TARGET_PROCESSOR_IMAGE" \
      "$TARGET_CONTROL_IMAGE" \
      verified succeeded 0
  elif [[ "$residual" == forward_pair_tear ]]; then
    printf '%s\n' "$LEGACY_SHA" > "$CURRENT_RELEASE_FILE"
    cp "$PREVIOUS_METADATA_FILE" "$CURRENT_METADATA_FILE"
    write_deployment_state \
      "$TARGET_SHA" \
      "$TARGET_API_IMAGE" \
      "$TARGET_WEB_IMAGE" \
      "$TARGET_WORKER_IMAGE" \
      "$TARGET_PROCESSOR_IMAGE" \
      "$TARGET_CONTROL_IMAGE" \
      running_unverified failed 137
    forward_pointer_tmp="$APP_ROOT/forward-pointer.tmp"
    forward_metadata_tmp="$APP_ROOT/forward-metadata.tmp"
    printf '%s\n' "$TARGET_SHA" > "$forward_pointer_tmp"
    write_release_record \
      "$forward_metadata_tmp" \
      "$TARGET_SHA" \
      "$TARGET_API_IMAGE" \
      "$TARGET_WEB_IMAGE" \
      "$TARGET_WORKER_IMAGE" \
      "$TARGET_PROCESSOR_IMAGE" \
      "$TARGET_CONTROL_IMAGE"
    set +e
    node "$DEPLOY_TOOLING_FILE" durably-install-release-pair \
      "$forward_pointer_tmp" \
      "$CURRENT_RELEASE_FILE" \
      "$forward_metadata_tmp" \
      "$CURRENT_METADATA_FILE" \
      true >/dev/null 2>&1
    pair_status="$?"
    set -e
    [[ "$pair_status" -eq 137 ]] ||
      fail "forward release-pair killpoint exited $pair_status instead of 137"
    rm -f "$forward_metadata_tmp"
  else
    printf '%s\n' "$LEGACY_SHA" > "$CURRENT_RELEASE_FILE"
    cp "$PREVIOUS_METADATA_FILE" "$CURRENT_METADATA_FILE"
    write_deployment_state \
      "$TARGET_SHA" \
      "$TARGET_API_IMAGE" \
      "$TARGET_WEB_IMAGE" \
      "$TARGET_WORKER_IMAGE" \
      "$TARGET_PROCESSOR_IMAGE" \
      "$TARGET_CONTROL_IMAGE" \
      running_unverified failed 1
  fi
  chmod 600 \
    "$CURRENT_RELEASE_FILE" \
    "$CURRENT_METADATA_FILE" \
    "$PREVIOUS_METADATA_FILE" \
    "$DEPLOYMENT_STATE_FILE"
  if [[ "$residual" == finalization_evidence ]]; then
    cp "$JOURNAL_FILE" "$EVIDENCE_FILE"
    chmod 600 "$EVIDENCE_FILE"
  fi
  if [[ "$residual" == after_legacy_rename ]]; then
    for service in migrate backup restore; do
      proof_compose --profile tools run -d "$service" sleep infinity >/dev/null
    done
  fi
}

recovery_environment=(
  env
  "PATH=$BIN_DIR:$PATH"
  "PRESSLY_PROOF_REAL_DOCKER=$REAL_DOCKER"
  "PRESSLY_PROOF_APP_IMAGE=$APP_IMAGE"
  "PRESSLY_PROOF_PROJECT=$PROJECT_NAME"
  "PRESSLY_PROOF_LEGACY_API_IMAGE=$LEGACY_API_IMAGE"
  "PRESSLY_PROOF_LEGACY_WEB_IMAGE=$LEGACY_WEB_IMAGE"
  "PRESSLY_PROOF_LEGACY_WORKER_IMAGE=$LEGACY_WORKER_IMAGE"
  "PRESSLY_PROOF_LEGACY_PROCESSOR_IMAGE=$LEGACY_PROCESSOR_IMAGE"
  "PRESSLY_PROOF_LEGACY_CONTROL_IMAGE=$LEGACY_CONTROL_IMAGE"
  "PRESSLY_APP_ROOT=$APP_ROOT"
  "PRESSLY_REPO_DIR=$REPO_DIR"
  "PRESSLY_ENV_DIR=$ENV_DIR"
  "PRESSLY_COMPOSE_ENV_FILE=$COMPOSE_ENV_FILE"
  "PRESSLY_POSTGRES_ENV_FILE=$POSTGRES_ENV_FILE"
  "PRESSLY_COMPOSE_FILE=$COMPOSE_FILE"
  "PRESSLY_CLEAN_EPOCH_LEGACY_COMPOSE_OVERRIDE_FILE=$LEGACY_OVERRIDE_FILE"
  "PRESSLY_CLEAN_EPOCH_DECLARATION=$DECLARATION_FILE"
  "PRESSLY_DEPLOY_TOOLING_FILE=$DEPLOY_TOOLING_FILE"
  "PRESSLY_TOOLING_ERROR_FACTORY_PATH=$TOOLING_ERROR_FACTORY"
  "PRESSLY_CLEAN_EPOCH_ROLLBACK_SCRIPT=$ROLLBACK_SCRIPT"
  "PRESSLY_CLEAN_EPOCH_OPS_SOURCE_SHA_FILE=$OPS_SOURCE_SHA_FILE"
  "PRESSLY_BACKUP_DIR=$BACKUP_DIR"
  "PRESSLY_EXPECTED_PUBLIC_IP=127.0.0.1"
  "PRESSLY_CLEAN_EPOCH_EXPECTED_LEGACY_SHA=$LEGACY_SHA"
  "PRESSLY_CLEAN_EPOCH_EXPECTED_TARGET_SHA=$TARGET_SHA"
  "PRESSLY_CLEAN_EPOCH_RECOVERY_CONFIRM=$EXPECTED_CONFIRM"
  'PRESSLY_HEALTH_MAX_ATTEMPTS=1'
  'PRESSLY_HEALTH_RETRY_DELAY_SECONDS=0'
  'PRESSLY_HEALTH_REQUEST_TIMEOUT_SECONDS=1'
)

verify_case() {
  local residual="$1"
  [[ ! -e "$JOURNAL_FILE" ]] || fail "$residual retained an active journal"
  [[ "$(node "$DEPLOY_TOOLING_FILE" json-file-field "$EVIDENCE_FILE" phase)" == aborted ]] ||
    fail "$residual did not write aborted evidence"
  [[ "$(< "$CURRENT_RELEASE_FILE")" == "$LEGACY_SHA" ]] ||
    fail "$residual did not restore the legacy release pointer"
  [[ "$(node "$DEPLOY_TOOLING_FILE" json-file-field "$CURRENT_METADATA_FILE" sourceSha)" == "$LEGACY_SHA" ]] ||
    fail "$residual did not restore exact legacy release metadata"
  [[ "$(node "$DEPLOY_TOOLING_FILE" json-file-field "$DEPLOYMENT_STATE_FILE" phase)" == verified ]] ||
    fail "$residual did not commit verified deployment state"
  ledger_rows="$(
    proof_compose exec -T postgres psql \
      -v ON_ERROR_STOP=1 -U postgres -d pressly -AtF '|' <<'SQL'
SELECT id::text, hash, created_at::text
FROM drizzle.__drizzle_migrations
ORDER BY created_at ASC, id ASC;
SQL
  )"
  [[ "$(printf '%s\n' "$ledger_rows" | sha256sum | cut -d' ' -f1)" == "$LEGACY_LEDGER_SHA256" ]] ||
    fail "$residual restored the wrong migration ledger"
  [[ "$(
    proof_compose exec -T postgres psql \
      -v ON_ERROR_STOP=1 -U postgres -d postgres -At <<'SQL'
SELECT has_database_privilege('pressly_runtime', 'pressly', 'CONNECT');
SQL
  )" == t ]] || fail "$residual did not restore pressly_runtime CONNECT"
  [[ "$(
    proof_compose exec -T postgres psql \
      -v ON_ERROR_STOP=1 -U postgres -d postgres -At <<'SQL'
SELECT datallowconn FROM pg_database WHERE datname = 'pressly';
SQL
  )" == t ]] || fail "$residual left the legacy database connection-disabled"
  for service in api worker caddy; do
    container_id="$(proof_compose ps -q "$service")"
    [[ -n "$container_id" ]] || fail "$residual left $service stopped"
    [[ "$("$REAL_DOCKER" inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id")" == unless-stopped ]] ||
      fail "$residual left $service fenced after success"
  done
  [[ -z "$(
    proof_compose --profile tools ps --all --quiet migrate backup restore
  )" ]] || fail "$residual retained a one-off database tooling container"
}

cases=(
  'preparing after_aborting'
  'candidate_ready after_fence'
  'after_legacy_rename after_legacy_to_target'
  'after_legacy_rename after_legacy_rename_before_allow'
  'after_candidate_rename after_target_to_candidate'
  'validated after_legacy_rollback'
  'validated after_current_pointer_commit'
  'public_verified after_legacy_verified'
  'finalization after_journal_retired'
  'finalization_evidence after_legacy_database_restored'
  'forward_pair_tear after_legacy_rollback'
)

for proof_case in "${cases[@]}"; do
  read -r residual kill_phase <<< "$proof_case"
  echo "Proving $residual with hard interruption at $kill_phase."
  prepare_case "$residual"
  "${recovery_environment[@]}" "$RECOVERY_SCRIPT" --preflight-only >/dev/null
  set +e
  "${recovery_environment[@]}" \
    "PRESSLY_CLEAN_EPOCH_RECOVERY_TEST_KILL_PHASE=$kill_phase" \
    "$RECOVERY_SCRIPT" >/dev/null 2>&1
  killed_status="$?"
  set -e
  [[ "$killed_status" -eq 137 ]] ||
    fail "$residual killpoint exited $killed_status instead of 137"
  "${recovery_environment[@]}" "$RECOVERY_SCRIPT" >/dev/null
  verify_case "$residual"
done

echo 'Proving same-SHA/different-digest legacy rejection.'
prepare_case public_verified
write_release_record \
  "$PREVIOUS_METADATA_FILE" \
  "$LEGACY_SHA" \
  "ghcr.io/pressly-proof/pressly-api@sha256:$(digest c)" \
  "$LEGACY_WEB_IMAGE" \
  "$LEGACY_WORKER_IMAGE" \
  "$LEGACY_PROCESSOR_IMAGE" \
  "$LEGACY_CONTROL_IMAGE"
set +e
"${recovery_environment[@]}" "$RECOVERY_SCRIPT" --preflight-only >/dev/null 2>&1
mismatch_status="$?"
set -e
[[ "$mismatch_status" -ne 0 ]] ||
  fail 'same-SHA/different-digest legacy release unexpectedly passed admission'
[[ -f "$JOURNAL_FILE" && ! -f "$EVIDENCE_FILE" ]] ||
  fail 'identity mismatch changed clean-epoch recovery state'

echo 'Disposable clean-epoch recovery proof passed:'
echo '  real PostgreSQL and Docker Compose'
echo '  all pre-finalization database topologies'
echo '  exact legacy five-image selection'
echo '  hard-kill resumption through aborted evidence retirement'
