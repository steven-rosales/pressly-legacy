#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DEPLOY_TOOLING_FILE="$ROOT_DIR/deploy/aws/lightsail/deployment-tooling.mjs"
export PRESSLY_DEPLOY_TOOLING_FILE="$DEPLOY_TOOLING_FILE"
export PRESSLY_TOOLING_ERROR_FACTORY_PATH="$ROOT_DIR/platform/errors/src/tooling-error.mjs"
COMPOSE_FILE="$ROOT_DIR/deploy/aws/lightsail/docker-compose.production.yml"
RESTORE_SCRIPT="$ROOT_DIR/deploy/aws/lightsail/restore-postgres.sh"
ROLE_SCRIPT="$ROOT_DIR/deploy/aws/lightsail/configure-database-roles.sh"
SOURCE_ROLE_SQL="$ROOT_DIR/deploy/postgres/configure-roles.sql"
SOURCE_MIGRATION_DIR="$ROOT_DIR/platform/postgres/migrations"
SOURCE_MIGRATION_JOURNAL="$SOURCE_MIGRATION_DIR/meta/_journal.json"
POSTGRES_IMAGE='postgres:18.1-bookworm@sha256:cc9f4143a8d2fa8cf3749d0cb4d26ecf2d53a77a2ac807e9ebd67ae22426221a'
PROJECT_NAME="${PRESSLY_RESTORE_PROOF_PROJECT:-pressly-restore-proof-$(id -u)-$$}"
FENCE_MODEL_PROJECT="$PROJECT_NAME-fence"
PROVIDED_API_IMAGE="${PRESSLY_RESTORE_PROOF_API_IMAGE:-}"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-restore-proof.XXXXXX")"
ENV_DIR="$WORK_DIR/env"
BACKUP_DIR="$WORK_DIR/backups"
COMPOSE_ENV_FILE="$ENV_DIR/compose.env"
POSTGRES_ENV_FILE="$ENV_DIR/postgres.env"
MIGRATION_ENV_FILE="$ENV_DIR/migration.env"
ROLE_ENV_FILE="$ENV_DIR/database-roles.env"
BACKUP_ENV_FILE="$ENV_DIR/backup.env"
PASSPHRASE_FILE="$WORK_DIR/backup-passphrase.txt"
HOST_IDENTITY_FILE="$WORK_DIR/host-identity.json"
FENCE_MODEL_COMPOSE_FILE="$WORK_DIR/service-fence.compose.yml"
FENCE_MODEL_OVERRIDE_FILE="$WORK_DIR/service-fence.override.yml"
FENCE_MODEL_JOURNAL_FILE="$WORK_DIR/service-fence-journal.json"
BACKUP_FILE="$BACKUP_DIR/pressly-$(date -u +%Y%m%dT%H%M%SZ).dump.gpg"
RESTORE_OUTPUT="$WORK_DIR/restore-output.txt"
APPROVED_RELEASE_DIR="$WORK_DIR/approved-release"
APPROVED_COMPOSE_FILE="$APPROVED_RELEASE_DIR/deploy/aws/lightsail/docker-compose.production.yml"
APPROVED_ROLE_SQL="$APPROVED_RELEASE_DIR/deploy/postgres/configure-roles.sql"
APPROVED_MIGRATION_DIR="$APPROVED_RELEASE_DIR/platform/postgres/migrations"
APPROVED_MIGRATION_JOURNAL="$APPROVED_MIGRATION_DIR/meta/_journal.json"
RELEASE_SHA=''
UNRESOLVED_SHA="$(printf 'f%.0s' {1..40})"
RECOVERY_SHA="$(printf 'e%.0s' {1..40})"
MISMATCH_SHA="$(printf 'd%.0s' {1..40})"
STALE_BUNDLE_SHA="$(printf 'c%.0s' {1..40})"
API_IMAGE="${PROVIDED_API_IMAGE:-$PROJECT_NAME-api:proof}"
WEB_IMAGE="$PROJECT_NAME-web:proof"
WORKER_IMAGE="$PROJECT_NAME-worker:proof"
PROCESSOR_IMAGE="$PROJECT_NAME-processor:proof"
CONTROL_IMAGE="$PROJECT_NAME-control:proof"
UNRESOLVED_API_IMAGE="$PROJECT_NAME-api:unresolved"
UNRESOLVED_WEB_IMAGE="$PROJECT_NAME-web:unresolved"
UNRESOLVED_WORKER_IMAGE="$PROJECT_NAME-worker:unresolved"
UNRESOLVED_PROCESSOR_IMAGE="$PROJECT_NAME-processor:unresolved"
UNRESOLVED_CONTROL_IMAGE="$PROJECT_NAME-control:unresolved"
RECOVERY_API_IMAGE="$PROJECT_NAME-api:recovery"
RECOVERY_WEB_IMAGE="$PROJECT_NAME-web:recovery"
RECOVERY_WORKER_IMAGE="$PROJECT_NAME-worker:recovery"
RECOVERY_PROCESSOR_IMAGE="$PROJECT_NAME-processor:recovery"
RECOVERY_CONTROL_IMAGE="$PROJECT_NAME-control:recovery"
CURRENT_RELEASE_FILE="$WORK_DIR/current-release"
CURRENT_RELEASE_METADATA_FILE="$WORK_DIR/current-release.json"
DEPLOYMENT_STATE_FILE="$WORK_DIR/deployment-state.json"
RESTORE_JOURNAL_FILE="$WORK_DIR/postgres-restore.json"
N_MINUS_ONE_MIGRATIONS="$WORK_DIR/n-minus-one-migrations"
BUILT_API_IMAGE=false

fail() {
  echo "Disposable restore proof failed: $*" >&2
  exit 1
}

for command in cmp diff docker git gpg node openssl sha256sum; do
  command -v "$command" >/dev/null || fail "$command is required."
done

DOCKER_CONTEXT="$(docker context show)"
DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing a non-local DOCKER_HOST override.'
[[ "$DOCKER_ENDPOINT" == unix://* ]] ||
  fail "refusing a non-local Docker endpoint: $DOCKER_ENDPOINT"
[[ "$PROJECT_NAME" =~ ^pressly-restore-proof-[a-z0-9-]+$ ]] ||
  fail 'the proof project must start with pressly-restore-proof- and use lowercase letters, digits, and hyphens.'

PROJECT_CONTAINERS="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")"
PROJECT_NETWORKS="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
PROJECT_VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
[[ -z "$PROJECT_CONTAINERS" && -z "$PROJECT_NETWORKS" && -z "$PROJECT_VOLUMES" ]] ||
  fail "refusing to reuse Docker resources owned by $PROJECT_NAME."
FENCE_MODEL_RESOURCES="$(
  docker ps -aq --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
  docker network ls -q --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
  docker volume ls -q --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
)"
[[ -z "$FENCE_MODEL_RESOURCES" ]] ||
  fail "refusing to reuse Docker resources owned by $FENCE_MODEL_PROJECT."

if [[ -z "$PROVIDED_API_IMAGE" ]]; then
  docker image inspect "$API_IMAGE" >/dev/null 2>&1 &&
    fail "refusing to overwrite pre-existing image: $API_IMAGE"
fi

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    --env-file "$COMPOSE_ENV_FILE" \
    -f "$COMPOSE_FILE" \
    "$@"
}

fence_model_compose() {
  docker compose \
    --project-name "$FENCE_MODEL_PROJECT" \
    -f "$FENCE_MODEL_COMPOSE_FILE" \
    -f "$FENCE_MODEL_OVERRIDE_FILE" \
    "$@"
}

cleanup() {
  local exit_code="$?"
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e
  if ((exit_code != 0)); then
    compose ps >&2
    compose logs --no-color --tail=150 postgres >&2
  fi
  if [[ -f "$FENCE_MODEL_COMPOSE_FILE" && -f "$FENCE_MODEL_OVERRIDE_FILE" ]]; then
    fence_model_compose down --volumes --remove-orphans --timeout 10 >/dev/null || cleanup_failed=true
  fi
  compose down --volumes --remove-orphans --timeout 10 >/dev/null || cleanup_failed=true
  if [[ "$BUILT_API_IMAGE" == true ]]; then
    docker image rm "$API_IMAGE" >/dev/null 2>&1 || cleanup_failed=true
  fi
  rm -rf "$WORK_DIR" || cleanup_failed=true

  PROJECT_CONTAINERS="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  PROJECT_NETWORKS="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  PROJECT_VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  if [[ -n "$PROJECT_CONTAINERS" || -n "$PROJECT_NETWORKS" || -n "$PROJECT_VOLUMES" ]]; then
    cleanup_failed=true
  fi
  FENCE_MODEL_RESOURCES="$(
    docker ps -aq --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
    docker network ls -q --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
    docker volume ls -q --filter "label=com.docker.compose.project=$FENCE_MODEL_PROJECT"
  )"
  if [[ -n "$FENCE_MODEL_RESOURCES" ]]; then
    cleanup_failed=true
  fi

  if ((exit_code == 0)) && [[ "$cleanup_failed" == true ]]; then
    echo 'Disposable restore proof passed, but teardown was incomplete.' >&2
    exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

create_approved_release() {
  mkdir -p \
    "$(dirname "$APPROVED_COMPOSE_FILE")" \
    "$(dirname "$APPROVED_ROLE_SQL")" \
    "$APPROVED_MIGRATION_DIR"
  cp -- "$COMPOSE_FILE" "$APPROVED_COMPOSE_FILE"
  cp -- "$SOURCE_ROLE_SQL" "$APPROVED_ROLE_SQL"
  cp -a -- "$SOURCE_MIGRATION_DIR/." "$APPROVED_MIGRATION_DIR/"

  cmp --silent "$COMPOSE_FILE" "$APPROVED_COMPOSE_FILE" ||
    fail 'approved-release Compose snapshot differs from its source.'
  cmp --silent "$SOURCE_ROLE_SQL" "$APPROVED_ROLE_SQL" ||
    fail 'approved-release role snapshot differs from its source.'
  diff --recursive --brief "$SOURCE_MIGRATION_DIR" "$APPROVED_MIGRATION_DIR" >/dev/null ||
    fail 'approved-release migration snapshot differs from its source.'

  git -C "$APPROVED_RELEASE_DIR" init --quiet --initial-branch=proof
  git -C "$APPROVED_RELEASE_DIR" add -- \
    deploy/aws/lightsail/docker-compose.production.yml \
    deploy/postgres/configure-roles.sql \
    platform/postgres/migrations
  GIT_AUTHOR_NAME='Pressly restore proof' \
    GIT_AUTHOR_EMAIL='restore-proof@pressly.invalid' \
    GIT_AUTHOR_DATE='2000-01-01T00:00:00Z' \
    GIT_COMMITTER_NAME='Pressly restore proof' \
    GIT_COMMITTER_EMAIL='restore-proof@pressly.invalid' \
    GIT_COMMITTER_DATE='2000-01-01T00:00:00Z' \
    git -C "$APPROVED_RELEASE_DIR" commit --quiet \
      --message 'Snapshot approved restore inputs'
  RELEASE_SHA="$(git -C "$APPROVED_RELEASE_DIR" rev-parse HEAD)"
  [[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] ||
    fail 'synthetic approved release did not produce a canonical source SHA.'
  [[ -z "$(git -C "$APPROVED_RELEASE_DIR" status --porcelain --untracked-files=all)" ]] ||
    fail 'synthetic approved release is not clean after commit.'
}

create_approved_release

write_fence_model_phase() {
  local expected_phase="$1"
  local next_phase="$2"
  node "$DEPLOY_TOOLING_FILE" proof-write-fence-phase \
    "$FENCE_MODEL_JOURNAL_FILE" \
    "$expected_phase" \
    "$next_phase"
}

fence_model_policies() {
  local service
  local container_id
  local result=''
  for service in api worker caddy; do
    container_id="$(fence_model_compose ps -q "$service")"
    [[ -n "$container_id" ]] || fail "service-fence model $service is not running."
    result+="$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$container_id") "
  done
  printf '%s' "${result% }"
}

mkdir -p "$ENV_DIR" "$BACKUP_DIR"
chmod 700 "$ENV_DIR" "$BACKUP_DIR"
mkdir -p "$WORK_DIR/tmp"
chmod 700 "$WORK_DIR/tmp"
install -m 600 /dev/null "$FENCE_MODEL_COMPOSE_FILE"
printf '%s\n' \
  'services:' \
  '  api:' \
  "    image: $POSTGRES_IMAGE" \
  '    command: ["sleep", "infinity"]' \
  '    restart: unless-stopped' \
  '  worker:' \
  "    image: $POSTGRES_IMAGE" \
  '    command: ["sleep", "infinity"]' \
  '    restart: unless-stopped' \
  '  caddy:' \
  "    image: $POSTGRES_IMAGE" \
  '    command: ["sleep", "infinity"]' \
  '    restart: unless-stopped' \
  > "$FENCE_MODEL_COMPOSE_FILE"
install -m 600 /dev/null "$FENCE_MODEL_OVERRIDE_FILE"
printf '%s\n' \
  'services:' \
  '  api:' \
  '    restart: "no"' \
  '  worker:' \
  '    restart: "no"' \
  '  caddy:' \
  '    restart: "no"' \
  > "$FENCE_MODEL_OVERRIDE_FILE"

ADMIN_PASSWORD="$(openssl rand -hex 24)"
MIGRATION_PASSWORD="$(openssl rand -hex 24)"
RUNTIME_PASSWORD="$(openssl rand -hex 24)"
BACKUP_PASSWORD="$(openssl rand -hex 24)"
PASSPHRASE="$(openssl rand -hex 32)"

install -m 600 /dev/null "$COMPOSE_ENV_FILE"
printf '%s\n' \
  'PRESSLY_API_IMAGE=caller-stale-api:latest' \
  'PRESSLY_WEB_IMAGE=caller-stale-web:latest' \
  'PRESSLY_WORKER_IMAGE=caller-stale-worker:latest' \
  'PRESSLY_PROCESSOR_IMAGE=caller-stale-processor:latest' \
  'PRESSLY_CONTROL_IMAGE=caller-stale-control:latest' \
  "PRESSLY_RELEASE_SHA=$(printf '0%.0s' {1..40})" \
  > "$COMPOSE_ENV_FILE"

install -m 600 /dev/null "$POSTGRES_ENV_FILE"
printf '%s\n' \
  'POSTGRES_DB=pressly_restore_proof' \
  'POSTGRES_USER=pressly_admin' \
  "POSTGRES_PASSWORD=$ADMIN_PASSWORD" \
  > "$POSTGRES_ENV_FILE"

install -m 600 /dev/null "$MIGRATION_ENV_FILE"
printf 'DATABASE_URL=postgres://pressly_migration:%s@postgres:5432/pressly_restore_proof\n' \
  "$MIGRATION_PASSWORD" > "$MIGRATION_ENV_FILE"

install -m 600 /dev/null "$ROLE_ENV_FILE"
printf '%s\n' \
  "PRESSLY_MIGRATION_PASSWORD=$MIGRATION_PASSWORD" \
  "PRESSLY_RUNTIME_PASSWORD=$RUNTIME_PASSWORD" \
  "PRESSLY_BACKUP_PASSWORD=$BACKUP_PASSWORD" \
  > "$ROLE_ENV_FILE"

install -m 600 /dev/null "$BACKUP_ENV_FILE"
printf '%s\n' \
  'PGHOST=postgres' \
  'PGPORT=5432' \
  'PGDATABASE=pressly_restore_proof' \
  'PGUSER=pressly_backup' \
  "PGPASSWORD=$BACKUP_PASSWORD" \
  > "$BACKUP_ENV_FILE"

install -m 600 /dev/null "$PASSPHRASE_FILE"
printf '%s\n' "$PASSPHRASE" > "$PASSPHRASE_FILE"
install -m 600 /dev/null "$HOST_IDENTITY_FILE"
printf '%s\n' \
  '{"schemaVersion":1,"environment":"proof","publicHealthTarget":{"hostIdentity":"pressly-restore-proof","expectedPublicIpv4":"127.0.0.1","api":{"url":"https://api.restore-proof.invalid/health/ready","host":"api.restore-proof.invalid"},"web":{"url":"https://web.restore-proof.invalid/health","host":"web.restore-proof.invalid"},"processor":{"url":"https://processor.restore-proof.invalid/health","host":"processor.restore-proof.invalid"},"control":{"url":"https://control.restore-proof.invalid/health","host":"control.restore-proof.invalid"}}}' \
  > "$HOST_IDENTITY_FILE"

export COMPOSE_PROJECT_NAME="$PROJECT_NAME"
export PRESSLY_API_IMAGE="$API_IMAGE"
export PRESSLY_WEB_IMAGE="$WEB_IMAGE"
export PRESSLY_WORKER_IMAGE="$WORKER_IMAGE"
export PRESSLY_PROCESSOR_IMAGE="$PROCESSOR_IMAGE"
export PRESSLY_CONTROL_IMAGE="$CONTROL_IMAGE"
export PRESSLY_RELEASE_SHA="$RELEASE_SHA"
export PRESSLY_APP_ROOT="$WORK_DIR"
export PRESSLY_REPO_DIR="$APPROVED_RELEASE_DIR"
export PRESSLY_ENV_DIR="$ENV_DIR"
export PRESSLY_COMPOSE_ENV_FILE="$COMPOSE_ENV_FILE"
export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"
export PRESSLY_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE"
export PRESSLY_DATABASE_ROLES_ENV_FILE="$ROLE_ENV_FILE"
export PRESSLY_BACKUP_ENV_FILE="$BACKUP_ENV_FILE"
export PRESSLY_BACKUP_PASSPHRASE_FILE="$PASSPHRASE_FILE"
export PRESSLY_HOST_IDENTITY_FILE="$HOST_IDENTITY_FILE"
export PRESSLY_COMPOSE_FILE="$APPROVED_COMPOSE_FILE"
export PRESSLY_DATABASE_ROLES_SQL="$APPROVED_ROLE_SQL"
export PRESSLY_MIGRATION_JOURNAL="$APPROVED_MIGRATION_JOURNAL"
export PRESSLY_RESTORE_PROOF_MODE=true
export PRESSLY_CURRENT_RELEASE_FILE="$CURRENT_RELEASE_FILE"
export PRESSLY_CURRENT_RELEASE_METADATA_FILE="$CURRENT_RELEASE_METADATA_FILE"
export PRESSLY_DEPLOYMENT_STATE_FILE="$DEPLOYMENT_STATE_FILE"
export PRESSLY_RESTORE_JOURNAL_FILE="$RESTORE_JOURNAL_FILE"
export PRESSLY_OPERATION_LOCK_DIR="$WORK_DIR/run"
export TMPDIR="$WORK_DIR/tmp"
export \
  RELEASE_SHA \
  UNRESOLVED_SHA \
  RECOVERY_SHA \
  MISMATCH_SHA \
  API_IMAGE \
  WEB_IMAGE \
  WORKER_IMAGE \
  PROCESSOR_IMAGE \
  CONTROL_IMAGE \
  UNRESOLVED_API_IMAGE \
  UNRESOLVED_WEB_IMAGE \
  UNRESOLVED_WORKER_IMAGE \
  UNRESOLVED_PROCESSOR_IMAGE \
  UNRESOLVED_CONTROL_IMAGE \
  RECOVERY_API_IMAGE \
  RECOVERY_WEB_IMAGE \
  RECOVERY_WORKER_IMAGE \
  RECOVERY_PROCESSOR_IMAGE \
  RECOVERY_CONTROL_IMAGE

if [[ -z "$PROVIDED_API_IMAGE" ]]; then
  echo '[restore-proof] building the current API tools image.'
  docker build \
    --target runner \
    --label "org.opencontainers.image.revision=$RELEASE_SHA" \
    --tag "$API_IMAGE" \
    --file "$ROOT_DIR/deploy/images/api/Dockerfile" \
    "$ROOT_DIR"
  BUILT_API_IMAGE=true
else
  docker image inspect "$API_IMAGE" >/dev/null ||
    fail "provided API image does not exist: $API_IMAGE"
fi

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export \
  DEPLOYED_AT \
  CURRENT_SHA="$RELEASE_SHA" \
  CURRENT_API_IMAGE="$API_IMAGE" \
  CURRENT_WEB_IMAGE="$WEB_IMAGE" \
  CURRENT_WORKER_IMAGE="$WORKER_IMAGE" \
  CURRENT_PROCESSOR_IMAGE="$PROCESSOR_IMAGE" \
  CURRENT_CONTROL_IMAGE="$CONTROL_IMAGE"
printf '%s\n' "$RELEASE_SHA" > "$CURRENT_RELEASE_FILE"
printf '{"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","deployedAt":"%s"}\n' \
  "$RELEASE_SHA" \
  "$API_IMAGE" \
  "$WEB_IMAGE" \
  "$WORKER_IMAGE" \
  "$PROCESSOR_IMAGE" \
  "$CONTROL_IMAGE" \
  "$DEPLOYED_AT" > "$CURRENT_RELEASE_METADATA_FILE"
write_verified_state() {
  printf '{"schemaVersion":1,"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","phase":"verified","outcome":"succeeded","exitCode":0,"updatedAt":"%s"}\n' \
    "$RELEASE_SHA" \
    "$API_IMAGE" \
    "$WEB_IMAGE" \
    "$WORKER_IMAGE" \
    "$PROCESSOR_IMAGE" \
    "$CONTROL_IMAGE" \
    "$DEPLOYED_AT" > "$DEPLOYMENT_STATE_FILE"
}

write_running_unverified_state() {
  local same_release="${1:-false}"
  local updated_at="${2:-$DEPLOYED_AT}"
  local source_sha="$UNRESOLVED_SHA"
  local api_image="$UNRESOLVED_API_IMAGE"
  local web_image="$UNRESOLVED_WEB_IMAGE"
  local worker_image="$UNRESOLVED_WORKER_IMAGE"
  local processor_image="$UNRESOLVED_PROCESSOR_IMAGE"
  local control_image="$UNRESOLVED_CONTROL_IMAGE"
  if [[ "$same_release" == true ]]; then
    source_sha="$RELEASE_SHA"
    api_image="$API_IMAGE"
    web_image="$WEB_IMAGE"
    worker_image="$WORKER_IMAGE"
    processor_image="$PROCESSOR_IMAGE"
    control_image="$CONTROL_IMAGE"
  fi
  printf '{"schemaVersion":1,"releaseFormat":"five-image-v1","sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","controlImage":"%s","phase":"running_unverified","outcome":"failed","exitCode":31,"updatedAt":"%s"}\n' \
    "$source_sha" \
    "$api_image" \
    "$web_image" \
    "$worker_image" \
    "$processor_image" \
    "$control_image" \
    "$updated_at" > "$DEPLOYMENT_STATE_FILE"
}

write_recovering_unverified_state() {
  local current_position="${1:-target}"
  PRESSLY_RESTORE_PROOF_STATE_POSITION="$current_position" \
    node --input-type=module - "$DEPLOYMENT_STATE_FILE" <<'NODE'
import { writeFileSync } from 'node:fs';

const { toolingError } = await import(
  process.env.PRESSLY_TOOLING_ERROR_FACTORY_PATH
);

const identity = (prefix) => ({
  releaseFormat: 'five-image-v1',
  sourceSha: process.env[`${prefix}_SHA`],
  apiImage: process.env[`${prefix}_API_IMAGE`],
  webImage: process.env[`${prefix}_WEB_IMAGE`],
  workerImage: process.env[`${prefix}_WORKER_IMAGE`],
  processorImage: process.env[`${prefix}_PROCESSOR_IMAGE`],
  controlImage: process.env[`${prefix}_CONTROL_IMAGE`],
});
const record = (prefix) => ({
  ...identity(prefix),
  deployedAt: process.env.DEPLOYED_AT,
});
const current = record('CURRENT');
const recovery = record('RECOVERY');
const mismatch = { ...recovery, sourceSha: process.env.MISMATCH_SHA };
const position = process.env.PRESSLY_RESTORE_PROOF_STATE_POSITION;
let unresolvedRelease;
let recoveryTarget;
let rollbackPrevious;
if (position === 'target') {
  unresolvedRelease = identity('UNRESOLVED');
  recoveryTarget = current;
  rollbackPrevious = null;
} else if (position === 'previous') {
  unresolvedRelease = identity('CURRENT');
  recoveryTarget = recovery;
  rollbackPrevious = current;
} else if (position === 'mismatch') {
  unresolvedRelease = identity('CURRENT');
  recoveryTarget = recovery;
  rollbackPrevious = mismatch;
} else {
  throw toolingError({
    code: 'restore_proof_state_position_invalid',
    message: `unknown recovery-state position: ${position}`,
  });
}
const state = {
  schemaVersion: 2,
  phase: 'recovering_unverified',
  outcome: 'failed',
  exitCode: 31,
  updatedAt: process.env.DEPLOYED_AT,
  unresolvedRelease,
  recoveryTarget,
  rollbackPrevious,
};
writeFileSync(process.argv[2], `${JSON.stringify(state)}\n`);
NODE
}

write_verified_state
chmod 600 \
  "$CURRENT_RELEASE_FILE" \
  "$CURRENT_RELEASE_METADATA_FILE" \
  "$DEPLOYMENT_STATE_FILE"

cp -a "$APPROVED_MIGRATION_DIR" "$N_MINUS_ONE_MIGRATIONS"
chmod 711 "$WORK_DIR"
chmod 755 "$N_MINUS_ONE_MIGRATIONS" "$N_MINUS_ONE_MIGRATIONS/meta"
N_MINUS_ONE_INFO="$(
  node --input-type=module - "$N_MINUS_ONE_MIGRATIONS" <<'NODE'
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { toolingError } = await import(
  process.env.PRESSLY_TOOLING_ERROR_FACTORY_PATH
);

const migrationsDirectory = process.argv[2];
const journalPath = join(migrationsDirectory, 'meta', '_journal.json');
const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
if (!Array.isArray(journal.entries) || journal.entries.length < 2) {
  throw toolingError({
    code: 'restore_proof_migration_history_too_short',
    message: 'migration journal needs at least two entries for N-1 proof',
  });
}
const removed = journal.entries.pop();
const previous = journal.entries.at(-1);
writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
rmSync(join(migrationsDirectory, `${removed.tag}.sql`));
rmSync(
  join(
    migrationsDirectory,
    'meta',
    `${removed.tag.split('_', 1)[0]}_snapshot.json`,
  ),
);
process.stdout.write(
  `${journal.entries.length}|${previous.when}|${removed.when}|${removed.tag}`,
);
NODE
)"
IFS='|' read -r \
  N_MINUS_ONE_COUNT \
  N_MINUS_ONE_TIMESTAMP \
  CURRENT_MIGRATION_TIMESTAMP \
  CURRENT_MIGRATION_TAG <<< "$N_MINUS_ONE_INFO"
[[ "$N_MINUS_ONE_COUNT" =~ ^[1-9][0-9]*$ ]] ||
  fail 'could not construct the N-1 migration fixture.'

echo "[restore-proof] creating a disposable N-1 source database before $CURRENT_MIGRATION_TAG."
compose up -d --wait postgres
"$ROLE_SCRIPT"
compose --profile tools run --rm -T \
  --volume "$N_MINUS_ONE_MIGRATIONS:/repo/platform/postgres/migrations:ro" \
  --workdir /repo/topology migrate \
  node node_modules/drizzle-kit/bin.cjs migrate --config tooling/drizzle.config.ts

N_MINUS_ONE_ACTUAL="$(
  compose exec -T postgres psql \
    -U pressly_admin \
    -d pressly_restore_proof \
    -AtF '|' \
    -c 'select count(*), max(created_at) from drizzle.__drizzle_migrations;'
)"
[[ "$N_MINUS_ONE_ACTUAL" == "$N_MINUS_ONE_COUNT|$N_MINUS_ONE_TIMESTAMP" ]] ||
  fail "source migration state is $N_MINUS_ONE_ACTUAL; expected $N_MINUS_ONE_COUNT|$N_MINUS_ONE_TIMESTAMP."

compose --profile tools run --rm -T \
  -e PGHOST=postgres \
  -e PGPORT=5432 \
  -e PGDATABASE=pressly_restore_proof \
  -e PGUSER=pressly_migration \
  -e PGPASSWORD="$MIGRATION_PASSWORD" \
  restore psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE restore_proof_records (
  id integer PRIMARY KEY,
  value text NOT NULL
);
INSERT INTO restore_proof_records (id, value) VALUES (1, 'before-backup');
CREATE FUNCTION restore_proof_value() RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'before-backup'::text $$;
SQL

echo '[restore-proof] producing the real encrypted backup triplet.'
compose --profile tools run --rm -T backup \
  pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  | gpg --symmetric --cipher-algo AES256 --batch --passphrase-file "$PASSPHRASE_FILE" \
    > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"
BACKUP_CHECKSUM="$(sha256sum "$BACKUP_FILE" | cut -d' ' -f1)"
BACKUP_SIZE="$(stat -c '%s' "$BACKUP_FILE")"
printf '%s  %s\n' "$BACKUP_CHECKSUM" "$(basename "$BACKUP_FILE")" \
  > "$BACKUP_FILE.sha256"
printf '{"createdAt":"%s","object":"local-disposable","sha256":"%s","sizeBytes":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$BACKUP_CHECKSUM" "$BACKUP_SIZE" \
  > "$BACKUP_FILE.json"
chmod 600 "$BACKUP_FILE.sha256" "$BACKUP_FILE.json"

echo "[restore-proof] advancing the unchanged live target through $CURRENT_MIGRATION_TAG."
compose --profile tools run --rm -T --workdir /repo migrate \
  node --import tsx tooling/postgres/migrate.ts
[[ "$(
  compose exec -T postgres psql \
    -U pressly_admin \
    -d pressly_restore_proof \
    -AtF '|' \
    -c 'select count(*), max(created_at) from drizzle.__drizzle_migrations;'
)" == "$((N_MINUS_ONE_COUNT + 1))|$CURRENT_MIGRATION_TIMESTAMP" ]] ||
  fail 'live target did not reach the exact current migration before abort proofs.'

export PRESSLY_RESTORE_CONFIRM="pressly_restore_proof:$(basename "$BACKUP_FILE")"
export PRESSLY_RESTORE_RESUME_SERVICES=false

expect_restore_preflight() {
  local expected_status="$1"
  local expected_text="$2"
  local allow_unverified="${3:-false}"
  local output
  local status

  set +e
  output="$(
    PRESSLY_RESTORE_ALLOW_UNVERIFIED_DEPLOYMENT="$allow_unverified" \
      "$RESTORE_SCRIPT" --preflight-only "$BACKUP_FILE" 2>&1
  )"
  status="$?"
  set -e
  if [[ "$expected_status" == pass ]]; then
    [[ "$status" == 0 ]] || fail "restore preflight unexpectedly failed: $output"
  else
    [[ "$status" != 0 ]] || fail "restore preflight unexpectedly passed: $output"
  fi
  [[ "$output" == *"$expected_text"* ]] ||
    fail "restore preflight did not report '$expected_text': $output"
}

assert_approved_release_clean() {
  local status
  status="$(
    git -C "$APPROVED_RELEASE_DIR" status --porcelain --untracked-files=all
  )"
  [[ -z "$status" ]] ||
    fail "synthetic approved release was not restored after a rejection proof: $status"
}

echo '[restore-proof] proving approved recovery inputs are exact and fail-closed.'
GIT_AUTHOR_NAME='Pressly restore proof' \
  GIT_AUTHOR_EMAIL='restore-proof@pressly.invalid' \
  GIT_AUTHOR_DATE='2000-01-02T00:00:00Z' \
  GIT_COMMITTER_NAME='Pressly restore proof' \
  GIT_COMMITTER_EMAIL='restore-proof@pressly.invalid' \
  GIT_COMMITTER_DATE='2000-01-02T00:00:00Z' \
  git -C "$APPROVED_RELEASE_DIR" commit --quiet --allow-empty \
    --message 'Mismatched restore proof release'
MISMATCHED_RELEASE_SHA="$(git -C "$APPROVED_RELEASE_DIR" rev-parse HEAD)"
[[ "$MISMATCHED_RELEASE_SHA" != "$RELEASE_SHA" ]] ||
  fail 'HEAD-mismatch fixture did not advance the synthetic approved release.'
expect_restore_preflight fail 'repository checkout is'
echo '[restore-proof] approved-release HEAD mismatch rejected.'
git -C "$APPROVED_RELEASE_DIR" update-ref HEAD "$RELEASE_SHA"
assert_approved_release_clean

git -C "$APPROVED_RELEASE_DIR" rm --cached --quiet -- \
  deploy/aws/lightsail/docker-compose.production.yml
expect_restore_preflight fail 'recovery input is not tracked by the approved release'
echo '[restore-proof] untracked approved Compose input rejected.'
git -C "$APPROVED_RELEASE_DIR" add -- \
  deploy/aws/lightsail/docker-compose.production.yml
assert_approved_release_clean

printf '\n' >> "$APPROVED_COMPOSE_FILE"
expect_restore_preflight fail \
  'compose, role, and migration recovery inputs must match the approved release exactly'
echo '[restore-proof] dirty approved Compose input rejected.'
cp -- "$COMPOSE_FILE" "$APPROVED_COMPOSE_FILE"
assert_approved_release_clean

printf '\n' >> "$APPROVED_ROLE_SQL"
expect_restore_preflight fail \
  'compose, role, and migration recovery inputs must match the approved release exactly'
echo '[restore-proof] dirty approved role input rejected.'
cp -- "$SOURCE_ROLE_SQL" "$APPROVED_ROLE_SQL"
assert_approved_release_clean

printf '\n' >> "$APPROVED_MIGRATION_JOURNAL"
expect_restore_preflight fail \
  'compose, role, and migration recovery inputs must match the approved release exactly'
echo '[restore-proof] dirty approved migration input rejected.'
cp -- "$SOURCE_MIGRATION_JOURNAL" "$APPROVED_MIGRATION_JOURNAL"
assert_approved_release_clean

UNTRACKED_MIGRATION="$APPROVED_MIGRATION_DIR/restore-proof-untracked.sql"
install -m 600 /dev/null "$UNTRACKED_MIGRATION"
expect_restore_preflight fail \
  'compose, role, and migration recovery inputs must match the approved release exactly'
echo '[restore-proof] untracked approved migration input rejected.'
rm -- "$UNTRACKED_MIGRATION"
assert_approved_release_clean
expect_restore_preflight pass 'Release admission: verified'

write_public_verified_journal() {
  local admission="$1"
  PRESSLY_RESTORE_PROOF_JOURNAL_ADMISSION="$admission" \
    node --input-type=module - \
      "$RESTORE_JOURNAL_FILE" \
      "$CURRENT_RELEASE_METADATA_FILE" \
      "$DEPLOYMENT_STATE_FILE" \
      "$HOST_IDENTITY_FILE" \
      "$BACKUP_FILE" \
      "$BACKUP_CHECKSUM" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const { toolingError } = await import(
  process.env.PRESSLY_TOOLING_ERROR_FACTORY_PATH
);

const [
  journalPath,
  metadataPath,
  statePath,
  hostIdentityPath,
  backupPath,
  backupSha256,
] = process.argv.slice(2);
const admission = process.env.PRESSLY_RESTORE_PROOF_JOURNAL_ADMISSION;
const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const state = JSON.parse(readFileSync(statePath, 'utf8'));
const hostIdentity = JSON.parse(readFileSync(hostIdentityPath, 'utf8'));
const {
  deployedAt: _deployedAt,
  ...releaseIdentity
} = metadata;
const runningUnverified = admission === 'running_unverified';
if (!runningUnverified && admission !== 'verified') {
  throw toolingError({
    code: 'restore_proof_journal_admission_invalid',
    message: `unsupported synthetic journal admission: ${admission}`,
  });
}
const unresolvedReleaseIdentity = runningUnverified
  ? Object.fromEntries(
      Object.entries(state).filter(([key]) =>
        [
          'releaseFormat',
          'sourceSha',
          'apiImage',
          'webImage',
          'workerImage',
          'processorImage',
          'controlImage',
        ].includes(key),
      ),
    )
  : null;
const journal = {
  schemaVersion: 1,
  backupBasename: backupPath.split('/').at(-1),
  backupSha256,
  releaseIdentity,
  publicHealthTarget: hostIdentity.publicHealthTarget,
  opsBundleOrigin: runningUnverified ? 'current' : 'repository-proof',
  deploymentAdmission: admission,
  unresolvedReleaseIdentity,
  unresolvedDeploymentState: runningUnverified ? state : null,
  targetDatabase: 'pressly_restore_proof',
  candidateDatabase: 'pressly_restore_proof_restore_20260808123456_99999',
  quarantineDatabase: 'pressly_restore_proof_damaged_20260808123456_99999',
  resumeServices: true,
  phase: 'public_verified',
  updatedAt: metadata.deployedAt,
};
writeFileSync(journalPath, `${JSON.stringify(journal)}\n`, { mode: 0o600 });
NODE
}

echo '[restore-proof] proving the provisioned host-identity authority is fail-closed.'
HOST_IDENTITY_SNAPSHOT_FILE="$WORK_DIR/host-identity.snapshot.json"
cp "$HOST_IDENTITY_FILE" "$HOST_IDENTITY_SNAPSHOT_FILE"
sed -i 's/^{"schemaVersion":1/{"schemaVersion":1,"schemaVersion":1/' \
  "$HOST_IDENTITY_FILE"
expect_restore_preflight fail 'duplicate field'
cp "$HOST_IDENTITY_SNAPSHOT_FILE" "$HOST_IDENTITY_FILE"
node --input-type=module - "$HOST_IDENTITY_FILE" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
const identity = JSON.parse(readFileSync(path, 'utf8'));
identity.publicHealthTarget.api.host = 'wrong.restore-proof.invalid';
writeFileSync(path, `${JSON.stringify(identity)}\n`);
NODE
expect_restore_preflight fail 'URL is not exact HTTPS authority'
cp "$HOST_IDENTITY_SNAPSHOT_FILE" "$HOST_IDENTITY_FILE"
chmod 644 "$HOST_IDENTITY_FILE"
expect_restore_preflight fail 'proof host identity must be owner-owned mode 0600'
chmod 600 "$HOST_IDENTITY_FILE"
set +e
HOST_OVERRIDE_OUTPUT="$(
  PRESSLY_EXPECTED_PUBLIC_IP=127.0.0.2 \
    "$RESTORE_SCRIPT" --preflight-only "$BACKUP_FILE" 2>&1
)"
HOST_OVERRIDE_STATUS="$?"
set -e
[[ "$HOST_OVERRIDE_STATUS" != 0 ]] ||
  fail 'host identity public-IP override unexpectedly passed.'
[[ "$HOST_OVERRIDE_OUTPUT" == *'does not match the provisioned host identity'* ]] ||
  fail "host identity override failed for the wrong reason: $HOST_OVERRIDE_OUTPUT"

echo '[restore-proof] proving verified and explicit unresolved deployment-state admission.'
write_verified_state
expect_restore_preflight pass 'Release admission: verified'
write_running_unverified_state false
expect_restore_preflight fail 'requires explicit operator admission'
expect_restore_preflight pass 'Release admission: running_unverified' true
write_running_unverified_state true
expect_restore_preflight pass 'Release admission: running_unverified' true
write_running_unverified_state true '2000-01-01T00:00:00Z'
expect_restore_preflight pass 'Release admission: running_unverified' true
write_recovering_unverified_state target
expect_restore_preflight fail 'requires explicit operator admission'
expect_restore_preflight pass 'Release admission: recovering_unverified' true
write_recovering_unverified_state previous
expect_restore_preflight pass 'Release admission: recovering_unverified' true
write_recovering_unverified_state mismatch
expect_restore_preflight fail \
  'current release must exactly match recoveryTarget or rollbackPrevious' true

write_recovering_unverified_state target
sed -i 's/^{"schemaVersion":2/{"schemaVersion":2,"schemaVersion":2/' \
  "$DEPLOYMENT_STATE_FILE"
expect_restore_preflight fail 'duplicate field' true

echo '[restore-proof] proving fresh-process public_verified admission is exact.'
write_running_unverified_state false
PUBLIC_VERIFIED_UNRESOLVED_STATE="$WORK_DIR/public-verified-unresolved-state.json"
cp "$DEPLOYMENT_STATE_FILE" "$PUBLIC_VERIFIED_UNRESOLVED_STATE"
write_verified_state
cp "$PUBLIC_VERIFIED_UNRESOLVED_STATE" "$DEPLOYMENT_STATE_FILE"
write_public_verified_journal running_unverified
write_verified_state
expect_restore_preflight pass 'Release admission: running_unverified' true
rm "$RESTORE_JOURNAL_FILE"
write_public_verified_journal verified
expect_restore_preflight pass 'Release admission: verified'
rm "$RESTORE_JOURNAL_FILE"

echo '[restore-proof] proving first-rollout candidate-bundle admission is exact and fail-closed.'
OPS_PROOF_ROOT="$WORK_DIR/ops-proof"
make_proof_ops_bundle() {
  local source_sha="$1"
  local release_directory="$OPS_PROOF_ROOT/releases/$source_sha"
  mkdir -p "$release_directory/payload"
  cp "$RESTORE_SCRIPT" "$release_directory/payload/restore-postgres.sh"
  cp "$DEPLOY_TOOLING_FILE" "$release_directory/payload/deployment-tooling.mjs"
  cp "$PRESSLY_TOOLING_ERROR_FACTORY_PATH" "$release_directory/payload/tooling-error.mjs"
  chmod 700 \
    "$release_directory/payload/restore-postgres.sh" \
    "$release_directory/payload/deployment-tooling.mjs" \
    "$release_directory/payload/tooling-error.mjs"
  printf '%s\n' "$source_sha" > "$release_directory/source-sha"
  (
    cd "$release_directory"
    sha256sum \
      source-sha \
      payload/restore-postgres.sh \
      payload/deployment-tooling.mjs \
      payload/tooling-error.mjs > SHA256SUMS
  )
  chmod 600 "$release_directory/source-sha" "$release_directory/SHA256SUMS"
}
make_proof_ops_bundle "$UNRESOLVED_SHA"
make_proof_ops_bundle "$STALE_BUNDLE_SHA"
make_proof_ops_bundle "$RELEASE_SHA"
ln -s "releases/$UNRESOLVED_SHA" "$OPS_PROOF_ROOT/candidate"
write_running_unverified_state false

expect_bundle_preflight() {
  local source_sha="$1"
  local expected_status="$2"
  local expected_text="$3"
  local output
  local status
  ln -sfn "releases/$source_sha" "$OPS_PROOF_ROOT/candidate"
  set +e
  output="$(
    PRESSLY_OPS_ROOT="$OPS_PROOF_ROOT" \
      PRESSLY_DEPLOY_TOOLING_FILE="$OPS_PROOF_ROOT/releases/$source_sha/payload/deployment-tooling.mjs" \
      PRESSLY_TOOLING_ERROR_FACTORY_PATH="$OPS_PROOF_ROOT/releases/$source_sha/payload/tooling-error.mjs" \
      PRESSLY_RESTORE_PROOF_BUNDLE_MODE=true \
      PRESSLY_RESTORE_ALLOW_UNVERIFIED_DEPLOYMENT=true \
      "$OPS_PROOF_ROOT/releases/$source_sha/payload/restore-postgres.sh" \
      --preflight-only "$BACKUP_FILE" 2>&1
  )"
  status="$?"
  set -e
  if [[ "$expected_status" == pass ]]; then
    [[ "$status" == 0 ]] || fail "candidate bundle preflight failed: $output"
  else
    [[ "$status" != 0 ]] || fail "candidate bundle preflight unexpectedly passed: $output"
  fi
  [[ "$output" == *"$expected_text"* ]] ||
    fail "candidate bundle preflight did not report '$expected_text': $output"
}

expect_bundle_preflight "$UNRESOLVED_SHA" pass 'Release admission: running_unverified'
expect_bundle_preflight "$STALE_BUNDLE_SHA" fail \
  'source SHA does not match the unresolved deployment identity'
ln -s "releases/$RELEASE_SHA" "$OPS_PROOF_ROOT/current"
expect_bundle_preflight "$UNRESOLVED_SHA" fail \
  'candidate recovery is forbidden while a hardened current operations bundle exists'
rm "$OPS_PROOF_ROOT/current"

# The full N-1 restore runs from the motivating partially mutating deployment
# state. Service resumption is disabled, so this unresolved evidence must remain
# unchanged for later public-health reconciliation.
write_running_unverified_state false
export PRESSLY_RESTORE_ALLOW_UNVERIFIED_DEPLOYMENT=true
UNRESOLVED_STATE_SNAPSHOT_FILE="$WORK_DIR/unresolved-deployment-state.json"
cp "$DEPLOYMENT_STATE_FILE" "$UNRESOLVED_STATE_SNAPSHOT_FILE"

compose --profile tools run --rm -T \
  -e PGHOST=postgres \
  -e PGPORT=5432 \
  -e PGDATABASE=pressly_restore_proof \
  -e PGUSER=pressly_migration \
  -e PGPASSWORD="$MIGRATION_PASSWORD" \
  restore psql -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO restore_proof_records (id, value) VALUES (2, 'after-backup');
CREATE TABLE restore_proof_post_backup_only (id integer PRIMARY KEY);
SQL

NORMAL_CONFIRM="pressly_restore_proof:$(basename "$BACKUP_FILE")"
ABORT_CONFIRM="ABORT:pressly_restore_proof:$(basename "$BACKUP_FILE")"

echo '[restore-proof] proving failure before the journal leaves services and Postgres untouched.'
PRE_JOURNAL_POSTGRES_ID="$(compose ps -q postgres)"
PRE_JOURNAL_SERVICES="$(compose ps --status running --services | sort)"
PRE_JOURNAL_DATABASE="$({
  compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -AtF '|' <<'SQL'
SELECT
  (SELECT datallowconn FROM pg_database WHERE datname = 'pressly_restore_proof'),
  (SELECT string_agg(value, ',' ORDER BY id) FROM public.restore_proof_records);
SQL
} 2>/dev/null)"
set +e
PRESSLY_RESTORE_TEST_FAIL_BEFORE_JOURNAL=true \
  "$RESTORE_SCRIPT" "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
PRE_JOURNAL_STATUS="$?"
set -e
[[ "$PRE_JOURNAL_STATUS" != 0 ]] ||
  fail 'simulated pre-journal failure unexpectedly passed.'
[[ ! -e "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'pre-journal failure created a restore journal.'
[[ "$(compose ps -q postgres)" == "$PRE_JOURNAL_POSTGRES_ID" ]] ||
  fail 'pre-journal failure recreated Postgres.'
[[ "$(compose ps --status running --services | sort)" == "$PRE_JOURNAL_SERVICES" ]] ||
  fail 'pre-journal failure changed running services.'
[[ "$({
  compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -AtF '|' <<'SQL'
SELECT
  (SELECT datallowconn FROM pg_database WHERE datname = 'pressly_restore_proof'),
  (SELECT string_agg(value, ',' ORDER BY id) FROM public.restore_proof_records);
SQL
} 2>/dev/null)" == "$PRE_JOURNAL_DATABASE" ]] ||
  fail 'pre-journal failure changed the target database.'

echo '[restore-proof] executing resumable pre-cutover abort and rename-boundary workflows.'

run_killed_restore() {
  local kill_phase="$1"
  local expected_journal_phase="$2"
  local expected_topology="$3"
  local exit_code
  local journal_phase
  local topology

  set +e
  PRESSLY_RESTORE_TEST_KILL_PHASE="$kill_phase" \
    "$RESTORE_SCRIPT" "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
  exit_code="$?"
  set -e
  [[ "$exit_code" == 137 ]] ||
    fail "restore kill phase $kill_phase exited $exit_code instead of 137."
  [[ -f "$RESTORE_JOURNAL_FILE" ]] ||
    fail "restore journal is missing after $kill_phase."

  journal_phase="$(
    node --input-type=module - "$RESTORE_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(JSON.parse(readFileSync(process.argv[2], 'utf8')).phase);
NODE
  )"
  [[ "$journal_phase" == "$expected_journal_phase" ]] ||
    fail "journal phase is $journal_phase after $kill_phase; expected $expected_journal_phase."

  topology="$(
    compose exec -T postgres psql \
      -U pressly_admin \
      -d postgres \
      -AtF '|' \
      -c "select count(*) filter (where datname = 'pressly_restore_proof'), count(*) filter (where datname like 'pressly_restore_proof_restore_%'), count(*) filter (where datname like 'pressly_restore_proof_damaged_%') from pg_database;"
  )"
  [[ "$topology" == "$expected_topology" ]] ||
    fail "database topology is $topology after $kill_phase; expected $expected_topology."
}

export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
write_recovering_unverified_state previous
SCHEMA2_STATE_SNAPSHOT_FILE="$WORK_DIR/schema2-deployment-state.json"
cp "$DEPLOYMENT_STATE_FILE" "$SCHEMA2_STATE_SNAPSHOT_FILE"
run_killed_restore after_preparing preparing '1|0|0'
[[ "$(
  node --input-type=module - \
    "$RESTORE_JOURNAL_FILE" \
    "$SCHEMA2_STATE_SNAPSHOT_FILE" \
    "$HOST_IDENTITY_SNAPSHOT_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const journal = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const state = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const hostIdentity = JSON.parse(readFileSync(process.argv[4], 'utf8'));
process.stdout.write(
  journal.deploymentAdmission === 'recovering_unverified' &&
    isDeepStrictEqual(journal.unresolvedDeploymentState, state) &&
    isDeepStrictEqual(
      journal.publicHealthTarget,
      hostIdentity.publicHealthTarget,
    )
    ? 'preserved'
    : 'invalid',
);
NODE
)" == preserved ]] ||
  fail 'restore journal did not preserve the complete schema-2 recovery state.'
node --input-type=module - "$HOST_IDENTITY_FILE" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
const identity = JSON.parse(readFileSync(path, 'utf8'));
identity.publicHealthTarget.expectedPublicIpv4 = '127.0.0.2';
writeFileSync(path, `${JSON.stringify(identity)}\n`);
NODE
set +e
HEALTH_TARGET_OVERRIDE_OUTPUT="$(
  PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
    "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" 2>&1
)"
HEALTH_TARGET_OVERRIDE_STATUS="$?"
set -e
[[ "$HEALTH_TARGET_OVERRIDE_STATUS" != 0 ]] ||
  fail 'restore journal accepted a changed public health target.'
[[ "$HEALTH_TARGET_OVERRIDE_OUTPUT" == *'publicHealthTarget does not match this invocation'* ]] ||
  fail "public health target override failed for the wrong reason: $HEALTH_TARGET_OVERRIDE_OUTPUT"
cp "$HOST_IDENTITY_SNAPSHOT_FILE" "$HOST_IDENTITY_FILE"
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
cmp -s "$SCHEMA2_STATE_SNAPSHOT_FILE" "$DEPLOYMENT_STATE_FILE" ||
  fail 'schema-2 abort changed the unresolved rollback recovery state.'
cp "$UNRESOLVED_STATE_SNAPSHOT_FILE" "$DEPLOYMENT_STATE_FILE"

export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
run_killed_restore after_preparing preparing '1|0|0'
STALE_QUARANTINE_DATABASE="$(
  node --input-type=module - "$RESTORE_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(
  JSON.parse(readFileSync(process.argv[2], 'utf8')).quarantineDatabase,
);
NODE
)"
compose exec -T postgres createdb \
  -U pressly_admin \
  "$STALE_QUARANTINE_DATABASE"
set +e
STALE_QUARANTINE_OUTPUT="$(
  "$RESTORE_SCRIPT" "$BACKUP_FILE" 2>&1
)"
STALE_QUARANTINE_STATUS="$?"
set -e
[[ "$STALE_QUARANTINE_STATUS" != 0 ]] ||
  fail 'preparing restore accepted a colliding quarantine database.'
[[ "$STALE_QUARANTINE_OUTPUT" == *'phase preparing conflicts with database topology candidate_promoted'* ]] ||
  fail "colliding quarantine failed for the wrong reason: $STALE_QUARANTINE_OUTPUT"
compose exec -T postgres dropdb \
  -U pressly_admin \
  --if-exists \
  --force \
  "$STALE_QUARANTINE_DATABASE"
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
[[ ! -e "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'abort before candidate creation did not retire the restore journal.'

export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
run_killed_restore after_candidate_ready candidate_ready '1|1|0'
IFS='|' read -r ANOMALOUS_CANDIDATE_DATABASE ANOMALOUS_QUARANTINE_DATABASE <<< "$(
  node --input-type=module - "$RESTORE_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
const journal = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(
  `${journal.candidateDatabase}|${journal.quarantineDatabase}`,
);
NODE
)"
compose exec -T postgres dropdb \
  -U pressly_admin \
  --if-exists \
  --force \
  "$ANOMALOUS_CANDIDATE_DATABASE"
compose exec -T postgres createdb \
  -U pressly_admin \
  "$ANOMALOUS_QUARANTINE_DATABASE"
set +e
ANOMALOUS_CUTOVER_OUTPUT="$(
  "$RESTORE_SCRIPT" "$BACKUP_FILE" 2>&1
)"
ANOMALOUS_CUTOVER_STATUS="$?"
set -e
[[ "$ANOMALOUS_CUTOVER_STATUS" != 0 ]] ||
  fail 'candidate-ready journal accepted an unreachable promoted topology.'
[[ "$ANOMALOUS_CUTOVER_OUTPUT" == *'phase candidate_ready conflicts with database topology candidate_promoted'* ]] ||
  fail "unreachable promoted topology failed for the wrong reason: $ANOMALOUS_CUTOVER_OUTPUT"
compose exec -T postgres dropdb \
  -U pressly_admin \
  --if-exists \
  --force \
  "$ANOMALOUS_QUARANTINE_DATABASE"
compose exec -T postgres createdb \
  -U pressly_admin \
  "$ANOMALOUS_CANDIDATE_DATABASE"
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
[[ ! -e "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'unsafe-topology proof abort did not retire the restore journal.'

export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
run_killed_restore after_candidate_ready candidate_ready '1|1|0'
set +e
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  PRESSLY_RESTORE_TEST_FAIL_ABORT_VALIDATION=true \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
ABORT_VALIDATION_STATUS="$?"
set -e
[[ "$ABORT_VALIDATION_STATUS" != 0 ]] ||
  fail 'simulated abort validation failure unexpectedly passed.'
[[ -f "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'abort validation failure retired the restore journal.'
[[ "$(
  compose exec -T postgres psql -U pressly_admin -d postgres -AtF '|' -c \
    "select count(*) filter (where datname = 'pressly_restore_proof'), count(*) filter (where datname like 'pressly_restore_proof_restore_%'), count(*) filter (where datname like 'pressly_restore_proof_damaged_%') from pg_database;"
)" == '1|1|0' ]] ||
  fail 'abort validation failure removed the validated candidate.'

set +e
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  PRESSLY_RESTORE_TEST_KILL_PHASE=after_abort_journal \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
ABORT_JOURNAL_STATUS="$?"
set -e
[[ "$ABORT_JOURNAL_STATUS" == 137 ]] ||
  fail "abort journal kill exited $ABORT_JOURNAL_STATUS instead of 137."
[[ "$(
  node --input-type=module - "$RESTORE_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(JSON.parse(readFileSync(process.argv[2], 'utf8')).phase);
NODE
)" == aborting ]] || fail 'abort commitment was not durable before service start.'
[[ "$(
  compose exec -T postgres psql -U pressly_admin -d postgres -AtF '|' -c \
    "select count(*) filter (where datname = 'pressly_restore_proof'), count(*) filter (where datname like 'pressly_restore_proof_restore_%'), count(*) filter (where datname like 'pressly_restore_proof_damaged_%') from pg_database;"
)" == '1|1|0' ]] ||
  fail 'abort journal kill changed the pre-cutover database topology.'

set +e
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  PRESSLY_RESTORE_TEST_KILL_PHASE=after_abort_candidate_drop \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
ABORT_DROP_STATUS="$?"
set -e
[[ "$ABORT_DROP_STATUS" == 137 ]] ||
  fail "abort drop kill exited $ABORT_DROP_STATUS instead of 137."
[[ "$(
  node --input-type=module - "$RESTORE_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(JSON.parse(readFileSync(process.argv[2], 'utf8')).phase);
NODE
)" == aborting ]] || fail 'abort drop kill did not durably record aborting.'
[[ "$(
  compose exec -T postgres psql -U pressly_admin -d postgres -AtF '|' -c \
    "select count(*) filter (where datname = 'pressly_restore_proof'), count(*) filter (where datname like 'pressly_restore_proof_restore_%'), count(*) filter (where datname like 'pressly_restore_proof_damaged_%') from pg_database;"
)" == '1|0|0' ]] ||
  fail 'abort drop kill left an unexpected database topology.'
PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
  "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" >> "$RESTORE_OUTPUT" 2>&1
[[ ! -e "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'fresh-process abort did not retire the aborting journal.'

export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
run_killed_restore after_target_rename candidate_ready '0|1|1'
set +e
POST_RENAME_ABORT_OUTPUT="$(
  PRESSLY_RESTORE_CONFIRM="$ABORT_CONFIRM" \
    "$RESTORE_SCRIPT" --abort-pre-cutover "$BACKUP_FILE" 2>&1
)"
POST_RENAME_ABORT_STATUS="$?"
set -e
[[ "$POST_RENAME_ABORT_STATUS" != 0 ]] ||
  fail 'post-rename abort unexpectedly passed.'
[[ "$POST_RENAME_ABORT_OUTPUT" == *'cannot abort restore after cutover topology target_quarantined'* ]] ||
  fail "post-rename abort failed for the wrong reason: $POST_RENAME_ABORT_OUTPUT"
[[ "$(
  node --input-type=module - \
    "$RESTORE_JOURNAL_FILE" \
    "$UNRESOLVED_STATE_SNAPSHOT_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const journal = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const unresolvedState = JSON.parse(readFileSync(process.argv[3], 'utf8'));
process.stdout.write(
  journal.deploymentAdmission === 'running_unverified' &&
    journal.releaseIdentity.sourceSha !==
      journal.unresolvedReleaseIdentity.sourceSha &&
    isDeepStrictEqual(journal.unresolvedDeploymentState, unresolvedState)
    ? 'bound'
    : 'invalid',
);
NODE
)" == bound ]] || fail 'restore journal did not bind current and unresolved release identities.'
export PRESSLY_RESTORE_CONFIRM="$NORMAL_CONFIRM"
run_killed_restore after_candidate_rename target_quarantined '1|0|1'
PRESSLY_RESTORE_TEST_KILL_PHASE='' \
  "$RESTORE_SCRIPT" "$BACKUP_FILE" | tee -a "$RESTORE_OUTPUT"
[[ ! -e "$RESTORE_JOURNAL_FILE" ]] ||
  fail 'validated restore journal was not durably retired.'
cmp -s "$UNRESOLVED_STATE_SNAPSHOT_FILE" "$DEPLOYMENT_STATE_FILE" ||
  fail 'controlled restore silently erased unresolved deployment evidence.'

QUARANTINE_DATABASE="$(
  compose exec -T postgres psql -U pressly_admin -d postgres -Atc \
    "select datname from pg_database where datname like 'pressly_restore_proof_damaged_%';"
)"
[[ -n "$QUARANTINE_DATABASE" ]] || fail 'the prior database was not quarantined.'

TARGET_VALUES="$(
  compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -Atc \
    'select string_agg(value, '\''|'\'' order by id) from restore_proof_records;'
)"
[[ "$TARGET_VALUES" == 'before-backup' ]] ||
  fail "the restored recovery point is wrong: $TARGET_VALUES"
[[ "$(compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -Atc \
  "select to_regclass('public.restore_proof_post_backup_only') is null;")" == 't' ]] ||
  fail 'post-backup data leaked into the restored database.'
[[ "$(compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -Atc \
  "select pg_get_userbyid(proowner) from pg_proc where proname = 'restore_proof_value';")" == 'pressly_migration' ]] ||
  fail 'restored function ownership is wrong.'
[[ "$(compose exec -T postgres psql -U pressly_admin -d pressly_restore_proof -AtF '|' -c \
  'select count(*), max(created_at) from drizzle.__drizzle_migrations;')" == "$((N_MINUS_ONE_COUNT + 1))|$CURRENT_MIGRATION_TIMESTAMP" ]] ||
  fail 'the current release migration was not applied to the N-1 backup.'

[[ "$(compose exec -T postgres psql -U pressly_admin -d postgres -Atc \
  "select datallowconn from pg_database where datname = '$QUARANTINE_DATABASE';")" == 'f' ]] ||
  fail 'the quarantined database still accepts connections.'

compose exec -T postgres psql -U pressly_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "alter database $QUARANTINE_DATABASE allow_connections true" >/dev/null
QUARANTINE_VALUES="$(
  compose exec -T postgres psql -U pressly_admin -d "$QUARANTINE_DATABASE" -Atc \
    'select string_agg(value, '\''|'\'' order by id) from restore_proof_records;'
)"
compose exec -T postgres psql -U pressly_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "alter database $QUARANTINE_DATABASE allow_connections false" >/dev/null
[[ "$QUARANTINE_VALUES" == 'before-backup|after-backup' ]] ||
  fail 'the quarantined database did not preserve the pre-restore state.'
[[ "$(compose exec -T postgres psql -U pressly_admin -d postgres -Atc \
  "select datallowconn from pg_database where datname = '$QUARANTINE_DATABASE';")" == 'f' ]] ||
  fail 'the quarantine was not closed again after the disposable evidence read.'

for service in caddy api worker; do
  if compose ps --status running --services | grep -Fx "$service" >/dev/null; then
    fail "$service restarted during a controlled restore drill."
  fi
done
[[ -f "$WORK_DIR/postgres-restore-last.json" ]] ||
  fail 'completed restore evidence was not retained.'
[[ "$(
  node --input-type=module - \
    "$WORK_DIR/postgres-restore-last.json" \
    "$UNRESOLVED_STATE_SNAPSHOT_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
const evidence = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const unresolved = JSON.parse(readFileSync(process.argv[3], 'utf8'));
process.stdout.write(
  evidence.phase === 'validated' &&
    isDeepStrictEqual(evidence.unresolvedDeploymentState, unresolved)
    ? 'retained'
    : 'invalid',
);
NODE
)" == retained ]] || fail 'completed restore evidence lost unresolved state.'

echo '[restore-proof] fault-injecting the durable service restart fence.'
set +e
(
  fence_model_compose up -d
  for service in api worker caddy; do
    docker update --restart=no "$(fence_model_compose ps -q "$service")" >/dev/null
  done
  write_fence_model_phase - validated
  kill -KILL "$BASHPID"
)
FENCE_PRE_PUBLIC_STATUS="$?"
set -e
[[ "$FENCE_PRE_PUBLIC_STATUS" == 137 ]] ||
  fail "service-fence pre-public kill exited $FENCE_PRE_PUBLIC_STATUS instead of 137."
[[ "$(fence_model_policies)" == 'no no no' ]] ||
  fail 'service restart policies escaped the fence before public verification.'

set +e
(
  write_fence_model_phase validated public_verified
  kill -KILL "$BASHPID"
)
FENCE_PUBLIC_VERIFIED_STATUS="$?"
set -e
[[ "$FENCE_PUBLIC_VERIFIED_STATUS" == 137 ]] ||
  fail "service-fence public-verified kill exited $FENCE_PUBLIC_VERIFIED_STATUS instead of 137."
[[ "$(fence_model_policies)" == 'no no no' ]] ||
  fail 'service restart policies lifted before public_verified resume.'
[[ "$(
  node --input-type=module - "$FENCE_MODEL_JOURNAL_FILE" <<'NODE'
import { readFileSync } from 'node:fs';
process.stdout.write(JSON.parse(readFileSync(process.argv[2], 'utf8')).phase);
NODE
)" == public_verified ]] || fail 'service-fence journal did not durably reach public_verified.'

for service in api worker caddy; do
  docker update --restart=unless-stopped \
    "$(fence_model_compose ps -q "$service")" >/dev/null
done
[[ "$(fence_model_policies)" == 'unless-stopped unless-stopped unless-stopped' ]] ||
  fail 'service restart policies were not lifted after public_verified resume.'
node "$DEPLOY_TOOLING_FILE" proof-remove-fence-phase \
  "$FENCE_MODEL_JOURNAL_FILE"
[[ ! -e "$FENCE_MODEL_JOURNAL_FILE" ]] ||
  fail 'service-fence journal was not durably retired.'
fence_model_compose down --volumes --remove-orphans --timeout 10 >/dev/null

echo '[restore-proof] production-shaped restore passed.'
echo "[restore-proof] backup_sha256=$BACKUP_CHECKSUM"
echo '[restore-proof] recovery_point=before-backup'
echo "[restore-proof] quarantined_database=$QUARANTINE_DATABASE"
echo '[restore-proof] role_grants_and_current_migrations=passed'
echo "[restore-proof] migration_upgrade=$N_MINUS_ONE_COUNT->$((N_MINUS_ONE_COUNT + 1)) ($CURRENT_MIGRATION_TAG)"
echo '[restore-proof] cutover_kill_recovery=target_rename,candidate_rename'
echo '[restore-proof] pre_cutover_abort=preparing,candidate_ready,validation_failure,post_drop_resume'
echo '[restore-proof] quarantine_collision=unique-name,preparing-rejected'
echo '[restore-proof] unreachable_cutover_topology=candidate-ready-promoted-rejected'
echo '[restore-proof] pre_journal_no_mutation=passed'
echo '[restore-proof] first_rollout_candidate_binding=exact,stale_rejected,current_preferred'
echo '[restore-proof] host_identity_authority=valid,malformed_rejected,override_rejected,journal_bound'
echo '[restore-proof] authoritative_release_metadata=passed'
echo '[restore-proof] approved_release_gate=head-mismatch,untracked-compose,dirty-compose,dirty-role,dirty-migration,untracked-migration'
echo '[restore-proof] unresolved_deployment_admission=schema1-distinct,schema1-matching,schema2-target,schema2-previous'
echo '[restore-proof] unresolved_deployment_state_preserved=passed'
echo '[restore-proof] public_verified_admission=verified,running_unverified'
echo '[restore-proof] completed_restore_evidence=passed'
echo '[restore-proof] service_restart_fence=pre-public-kill,public-verified-resume,retired'
echo '[restore-proof] production_resources_touched=no'
