#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRODUCTION_COMPOSE="$ROOT_DIR/infra/aws/lightsail/docker-compose.production.yml"
SMOKE_FIXTURE_DIR="$ROOT_DIR/tooling/fixtures/production-topology"
SMOKE_COMPOSE="$SMOKE_FIXTURE_DIR/docker-compose.smoke.yml"

usage() {
  cat <<'EOF'
Usage: tooling/scripts/production-topology-smoke.sh [--skip-build]

Builds and exercises a disposable, loopback-only production Compose topology.
The script refuses remote Docker contexts, uses an isolated project and volume,
proves the run-centered LPMS lifecycle, rotates two synthetic local four-image
releases, and always tears the stack down.
EOF
}

SKIP_BUILD=false
case "${1:-}" in
  '') ;;
  --skip-build) SKIP_BUILD=true ;;
  --help|-h)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

fail() {
  echo "offline topology smoke failed: $*" >&2
  exit 1
}

command -v docker >/dev/null || fail 'docker is required.'
command -v node >/dev/null || fail 'node is required.'
command -v curl >/dev/null || fail 'curl is required.'

DOCKER_CONTEXT="$(docker context show)"
DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing non-local DOCKER_HOST override.'
[[ "$DOCKER_ENDPOINT" == unix://* ]] ||
  fail "refusing non-local Docker endpoint: $DOCKER_ENDPOINT"

PROJECT_NAME="${PRESSLY_SMOKE_PROJECT:-pressly-v2-smoke-$(id -u)-$$}"
[[ "$PROJECT_NAME" =~ ^pressly-v2-smoke-[a-z0-9-]+$ ]] ||
  fail 'PRESSLY_SMOKE_PROJECT must start with pressly-v2-smoke- and contain only lowercase letters, digits, and hyphens.'

PROJECT_CONTAINERS="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")"
PROJECT_NETWORKS="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
PROJECT_VOLUMES="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
[[ -z "$PROJECT_CONTAINERS" && -z "$PROJECT_NETWORKS" && -z "$PROJECT_VOLUMES" ]] ||
  fail "refusing to reuse a Compose project that already owns Docker resources: $PROJECT_NAME"

for service in api web worker processor; do
  release_a_image="${PROJECT_NAME}-${service}:release-a"
  release_b_image="${PROJECT_NAME}-${service}:release-b"
  if [[ "$SKIP_BUILD" == true ]]; then
    docker image inspect "$release_a_image" >/dev/null 2>&1 ||
      fail "--skip-build requires pre-existing image: $release_a_image"
  elif docker image inspect "$release_a_image" >/dev/null 2>&1; then
    fail "refusing to overwrite pre-existing image: $release_a_image"
  fi
  if docker image inspect "$release_b_image" >/dev/null 2>&1; then
    fail "refusing to overwrite pre-existing image: $release_b_image"
  fi
done

if [[ -n "${PRESSLY_SMOKE_CADDY_PORT:-}" ]]; then
  CADDY_PORT="$PRESSLY_SMOKE_CADDY_PORT"
else
  CADDY_PORT="$((20000 + ($$ % 20000)))"
fi
[[ "$CADDY_PORT" =~ ^[0-9]+$ ]] || fail 'Caddy port must be numeric.'
((CADDY_PORT >= 1024 && CADDY_PORT <= 65535)) ||
  fail 'Caddy port must be between 1024 and 65535.'

REPORT_PATH="${PRESSLY_SMOKE_REPORT_PATH:-/tmp/${PROJECT_NAME}-report.json}"
[[ ! -e "$REPORT_PATH" ]] || fail "report path already exists: $REPORT_PATH"
REPORT_CREATED=false
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-v2-smoke.XXXXXX")"

export PRESSLY_SMOKE_REPO_ROOT="$ROOT_DIR"
export PRESSLY_SMOKE_FIXTURE_DIR="$SMOKE_FIXTURE_DIR"
export PRESSLY_SMOKE_CADDY_PORT="$CADDY_PORT"
export PRESSLY_SMOKE_DATABASE_PASSWORD="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(24).toString('hex')); ")"
export PRESSLY_SMOKE_AUTH_SECRET="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(48).toString('base64url')); ")"
export PRESSLY_SMOKE_MFA_ENCRYPTION_KEY="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64')); ")"
export PRESSLY_SMOKE_CSRF_SECRET="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(48).toString('base64url')); ")"
export PRESSLY_SMOKE_CENTS_HMAC_KEY="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(48).toString('base64url')); ")"
export PRESSLY_SMOKE_CENTS_QUARANTINE_KEY="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64')); ")"
OWNER_PASSWORD="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(24).toString('base64url') + 'Aa1!'); ")"

RELEASE_A_SOURCE="$(printf 'a%.0s' {1..40})"
RELEASE_B_SOURCE="$(printf 'b%.0s' {1..40})"

release_image() {
  local release="$1"
  local service="$2"
  printf '%s-%s:%s' "$PROJECT_NAME" "$service" "$release"
}

set_release() {
  local release="$1"
  export PRESSLY_API_IMAGE="$(release_image "$release" api)"
  export PRESSLY_WEB_IMAGE="$(release_image "$release" web)"
  export PRESSLY_WORKER_IMAGE="$(release_image "$release" worker)"
  export PRESSLY_PROCESSOR_IMAGE="$(release_image "$release" processor)"
  case "$release" in
    release-a) export PRESSLY_RELEASE_SHA="$RELEASE_A_SOURCE" ;;
    release-b) export PRESSLY_RELEASE_SHA="$RELEASE_B_SOURCE" ;;
    *) fail "unknown synthetic release: $release" ;;
  esac
}

set_release release-a

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    -f "$PRODUCTION_COMPOSE" \
    -f "$SMOKE_COMPOSE" \
    "$@"
}

cleanup() {
  local exit_code="$?"
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e
  if ((exit_code != 0)); then
    compose ps >&2
    compose logs --no-color --tail=200 caddy web api worker processor postgres >&2
  fi
  if ! compose down --volumes --remove-orphans --timeout 10 >/dev/null; then
    echo 'offline topology smoke cleanup failed: docker compose down did not succeed.' >&2
    cleanup_failed=true
  fi
  for release in release-a release-b; do
    [[ "$SKIP_BUILD" == true && "$release" == release-a ]] && continue
    for service in api web worker processor; do
      local image_name
      image_name="$(release_image "$release" "$service")"
      if ! docker image rm "$image_name" >/dev/null 2>&1; then
        echo "offline topology smoke cleanup failed: could not remove $image_name." >&2
        cleanup_failed=true
      fi
    done
  done

  local project_containers project_networks project_volumes
  if ! project_containers="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")"; then
    echo 'offline topology smoke cleanup failed: could not inspect project containers.' >&2
    cleanup_failed=true
  fi
  if ! project_networks="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"; then
    echo 'offline topology smoke cleanup failed: could not inspect project networks.' >&2
    cleanup_failed=true
  fi
  if ! project_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"; then
    echo 'offline topology smoke cleanup failed: could not inspect project volumes.' >&2
    cleanup_failed=true
  fi
  if [[ -n "$project_containers" || -n "$project_networks" || -n "$project_volumes" ]]; then
    echo "offline topology smoke cleanup failed: Docker resources remain for $PROJECT_NAME." >&2
    cleanup_failed=true
  fi

  if ! rm -rf "$WORK_DIR"; then
    echo "offline topology smoke cleanup failed: could not remove $WORK_DIR." >&2
    cleanup_failed=true
  fi

  if ((exit_code == 0)) && [[ "$cleanup_failed" == false ]]; then
    if ! node --input-type=module - "$REPORT_PATH" <<'NODE'
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
const reportPath = process.argv[2];
const temporaryPath = `${reportPath}.tmp-${process.pid}`;
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
report.teardown = {
  composeDownSucceeded: true,
  projectContainersRemaining: 0,
  projectNetworksRemaining: 0,
  projectVolumesRemaining: 0,
};
writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
renameSync(temporaryPath, reportPath);
NODE
    then
      echo 'offline topology smoke cleanup failed: could not finalize the proof report.' >&2
      cleanup_failed=true
    fi
  fi

  if ((exit_code == 0)) && [[ "$cleanup_failed" == true ]]; then
    [[ "$REPORT_CREATED" == true ]] && rm -f "$REPORT_PATH"
    exit_code=1
  elif ((exit_code != 0)); then
    [[ "$REPORT_CREATED" == true ]] && rm -f "$REPORT_PATH"
  else
    echo "[v2] offline topology proof passed and disposable Docker resources were removed; report=$REPORT_PATH"
    cat "$REPORT_PATH"
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[v2] project=$PROJECT_NAME docker_context=$DOCKER_CONTEXT endpoint=$DOCKER_ENDPOINT"
echo "[v2] rendering production Compose with the loopback-only smoke override"
RENDERED_CONFIG="$WORK_DIR/compose.json"
compose config --format json > "$RENDERED_CONFIG"
node --input-type=module - "$RENDERED_CONFIG" "$PROJECT_NAME" <<'NODE'
import { readFileSync } from 'node:fs';

const [path, project] = process.argv.slice(2);
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.name !== project)
  throw new Error(`Unexpected Compose project: ${config.name}`);

const published = Object.entries(config.services).flatMap(([name, service]) =>
  (service.ports ?? []).map((port) => ({ name, port })),
);
if (published.length !== 1 || published[0].name !== 'caddy')
  throw new Error(`Only Caddy may publish a smoke port: ${JSON.stringify(published)}`);
if (published[0].port.host_ip !== '127.0.0.1')
  throw new Error('The smoke Caddy port must bind only to 127.0.0.1.');
if (published[0].port.target !== 443)
  throw new Error('The smoke Caddy port must terminate local HTTPS on container port 443.');
if (config.services.worker.ports !== undefined || config.services.worker.expose !== undefined)
  throw new Error('Worker must have no published or exposed port.');
for (const service of ['api', 'web', 'worker', 'processor']) {
  if (config.services[service].read_only !== true)
    throw new Error(`${service} must have a read-only filesystem.`);
}
NODE

if [[ "$SKIP_BUILD" == false ]]; then
  echo '[v2] building release-a from all four production Dockerfiles'
  compose build api web worker processor
else
  echo '[v2] build skipped explicitly; pre-existing project-scoped release-a images are required'
fi

for service in api web worker processor; do
  release_a_image="$(release_image release-a "$service")"
  release_b_image="$(release_image release-b "$service")"
  docker image inspect "$release_a_image" >/dev/null ||
    fail "missing locally built image: $release_a_image"
  docker image tag "$release_a_image" "$release_b_image"
done

wait_for_health() {
  local service="$1"
  local deadline=$((SECONDS + 120))
  while ((SECONDS < deadline)); do
    local container_id
    container_id="$(compose ps -q "$service")"
    if [[ -n "$container_id" ]]; then
      local running health
      running="$(docker inspect --format '{{.State.Running}}' "$container_id")"
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id")"
      if [[ "$running" == true && ("$health" == healthy || "$health" == none) ]]; then
        return
      fi
      if [[ "$running" != true ]]; then
        compose logs --no-color --tail=100 "$service" >&2
        fail "$service stopped before becoming healthy."
      fi
    fi
    sleep 1
  done
  fail "$service did not become healthy within 120 seconds."
}

run_migrations() {
  compose --profile tools run --rm --workdir /repo/packages/db migrate \
    node node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts
}

database_scalar() {
  local sql="$1"
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U pressly -d pressly -Atc "$sql"
}

assert_release_images() {
  for service in api web worker processor; do
    local container_id actual expected
    container_id="$(compose ps -q "$service")"
    actual="$(docker inspect --format '{{.Config.Image}}' "$container_id")"
    expected="$(release_image "$1" "$service")"
    [[ "$actual" == "$expected" ]] ||
      fail "$service uses $actual; expected $expected"
  done
}

write_metadata() {
  local path="$1"
  local source_sha="$2"
  local temporary
  temporary="$(mktemp "${path}.tmp.XXXXXX")"
  printf '{"sourceSha":"%s","apiImage":"%s","webImage":"%s","workerImage":"%s","processorImage":"%s","kind":"local-synthetic"}\n' \
    "$source_sha" \
    "$PRESSLY_API_IMAGE" \
    "$PRESSLY_WEB_IMAGE" \
    "$PRESSLY_WORKER_IMAGE" \
    "$PRESSLY_PROCESSOR_IMAGE" > "$temporary"
  mv "$temporary" "$path"
}

promote_metadata() {
  local source_sha="$1"
  if [[ -f "$WORK_DIR/current-release.json" ]]; then
    local previous_tmp
    previous_tmp="$(mktemp "$WORK_DIR/previous-release.json.tmp.XXXXXX")"
    cp "$WORK_DIR/current-release.json" "$previous_tmp"
    mv "$previous_tmp" "$WORK_DIR/previous-release.json"
  fi
  write_metadata "$WORK_DIR/current-release.json" "$source_sha"
}

swap_metadata_for_rollback() {
  [[ -f "$WORK_DIR/current-release.json" && -f "$WORK_DIR/previous-release.json" ]] ||
    fail 'current and previous release metadata are required for rollback.'
  local current_tmp previous_tmp
  current_tmp="$(mktemp "$WORK_DIR/current-release.json.swap.XXXXXX")"
  previous_tmp="$(mktemp "$WORK_DIR/previous-release.json.swap.XXXXXX")"
  cp "$WORK_DIR/previous-release.json" "$current_tmp"
  cp "$WORK_DIR/current-release.json" "$previous_tmp"
  mv "$current_tmp" "$WORK_DIR/current-release.json"
  mv "$previous_tmp" "$WORK_DIR/previous-release.json"
}

assert_metadata() {
  local current_source="$1"
  local current_release="$2"
  local previous_source="$3"
  local previous_release="$4"
  node --input-type=module - \
    "$WORK_DIR/current-release.json" \
    "$WORK_DIR/previous-release.json" \
    "$current_source" \
    "$current_release" \
    "$previous_source" \
    "$previous_release" \
    "$PROJECT_NAME" <<'NODE'
import { readFileSync } from 'node:fs';

const [currentPath, previousPath, currentSource, currentRelease, previousSource, previousRelease, project] = process.argv.slice(2);
const verify = (path, source, release) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.sourceSha !== source || value.kind !== 'local-synthetic')
    throw new Error(`Unexpected release metadata in ${path}`);
  for (const service of ['api', 'web', 'worker', 'processor']) {
    const field = `${service}Image`;
    const expected = `${project}-${service}:${release}`;
    if (value[field] !== expected)
      throw new Error(`${field} is ${value[field]}; expected ${expected}`);
  }
};
verify(currentPath, currentSource, currentRelease);
verify(previousPath, previousSource, previousRelease);
NODE
}

probe_ok() {
  local host="$1"
  local path="$2"
  curl \
    --noproxy '*' \
    --insecure \
    --fail \
    --silent \
    --show-error \
    --retry 30 \
    --retry-delay 1 \
    --retry-all-errors \
    --resolve "${host}:${CADDY_PORT}:127.0.0.1" \
    "https://${host}:${CADDY_PORT}${path}" >/dev/null
}

probe_routes() {
  probe_ok web.pressly.test /health
  probe_ok api.pressly.test /health/ready
  probe_ok processor.pressly.test /
  probe_ok processor.pressly.test /health
  probe_ok processor.pressly.test /api/health/ready

  local auth_response="$WORK_DIR/processor-auth.json"
  local auth_status
  auth_status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --output "$auth_response" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    "https://processor.pressly.test:${CADDY_PORT}/api/processor/auth/session")"
  [[ "$auth_status" == 401 ]] || fail "processor auth route returned $auth_status; expected 401."
  node --input-type=module - "$auth_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.error?.code !== 'processor_session_missing')
  throw new Error('Processor auth route did not return its expected unauthenticated boundary.');
NODE
}

prove_processor_cookie_auth() {
  local origin="https://processor.pressly.test:${CADDY_PORT}"
  local cookie_jar="$WORK_DIR/processor-cookies.txt"
  local headers="$WORK_DIR/processor-login.headers"
  local login_response="$WORK_DIR/processor-login.json"
  local login_request="$WORK_DIR/processor-login-request.json"
  OWNER_PASSWORD="$OWNER_PASSWORD" OWNER_LOGIN_FILE="$login_request" \
    node --input-type=module -e "
      import { writeFileSync } from 'node:fs';
      writeFileSync(
        process.env.OWNER_LOGIN_FILE,
        JSON.stringify({
          email: 'owner@offline.pressly.test',
          password: process.env.OWNER_PASSWORD,
        }),
        { flag: 'wx' },
      );
    "
  local status
  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --dump-header "$headers" \
    --cookie-jar "$cookie_jar" \
    --output "$login_response" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    --header "Origin: $origin" \
    --header 'Content-Type: application/json' \
    --data-binary "@$login_request" \
    "${origin}/api/processor/auth/login")"
  [[ "$status" == 200 ]] || fail "processor login returned $status; expected 200."

  local session_cookie
  session_cookie="$(tr -d '\r' < "$headers" | grep -i '^set-cookie: __Host-pressly-processor-session=' | head -n 1)"
  [[ "$session_cookie" == *'; Secure'* ]] || fail 'processor session cookie is not Secure.'
  [[ "$session_cookie" == *'; HttpOnly'* ]] || fail 'processor session cookie is not HttpOnly.'
  [[ "$session_cookie" == *'; SameSite=Strict'* ]] || fail 'processor session cookie is not SameSite=Strict.'
  [[ "$session_cookie" == *'; Path=/'* ]] || fail 'processor session cookie is not root-scoped.'
  [[ "$session_cookie" != *'; Domain='* ]] || fail 'processor __Host cookie must not set Domain.'

  local csrf_token
  csrf_token="$(node --input-type=module - "$login_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== true || response?.data?.status !== 'authenticated')
  throw new Error('Processor login did not establish an authenticated session.');
if (typeof response.data.csrfToken !== 'string' || response.data.csrfToken.length !== 43)
  throw new Error('Processor login did not return a CSRF proof.');
const serialized = JSON.stringify(response);
if (serialized.includes('accessToken') || serialized.includes('challengeToken'))
  throw new Error('Processor login exposed an opaque credential in JSON.');
process.stdout.write(response.data.csrfToken);
NODE
  )"

  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --cookie "$cookie_jar" \
    --output "$WORK_DIR/processor-session.json" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    "${origin}/api/processor/auth/session")"
  [[ "$status" == 200 ]] || fail "processor session restore returned $status; expected 200."
  EXPECTED_CSRF_TOKEN="$csrf_token" \
    node --input-type=module - "$WORK_DIR/processor-session.json" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response?.ok !== true ||
  response?.data?.status !== 'authenticated' ||
  response.data.csrfToken !== process.env.EXPECTED_CSRF_TOKEN
)
  throw new Error('Processor session restoration did not return the authenticated session.');
if (JSON.stringify(response).includes('accessToken') || JSON.stringify(response).includes('challengeToken'))
  throw new Error('Processor session restoration exposed an opaque credential in JSON.');
NODE

  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --cookie "$cookie_jar" \
    --output "$WORK_DIR/processor-logout-missing-csrf.json" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    --header "Origin: $origin" \
    --request POST \
    "${origin}/api/processor/auth/logout")"
  [[ "$status" == 403 ]] || fail "processor logout without CSRF returned $status; expected 403."
  node --input-type=module - "$WORK_DIR/processor-logout-missing-csrf.json" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== false || response?.error?.code !== 'processor_csrf_rejected')
  throw new Error('Processor logout without CSRF was not rejected by the CSRF boundary.');
NODE

  local pre_logout_cookie_jar="$WORK_DIR/processor-cookies-before-logout.txt"
  local logout_headers="$WORK_DIR/processor-logout.headers"
  cp "$cookie_jar" "$pre_logout_cookie_jar"
  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --cookie "$cookie_jar" \
    --cookie-jar "$cookie_jar" \
    --dump-header "$logout_headers" \
    --output "$WORK_DIR/processor-logout.json" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    --header "Origin: $origin" \
    --header "X-CSRF-Token: $csrf_token" \
    --request POST \
    "${origin}/api/processor/auth/logout")"
  [[ "$status" == 200 ]] || fail "processor logout with CSRF returned $status; expected 200."
  node --input-type=module - "$WORK_DIR/processor-logout.json" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== true || response?.data?.revoked !== true)
  throw new Error('Processor logout did not confirm session revocation.');
NODE

  local cleared_session_cookie
  cleared_session_cookie="$(tr -d '\r' < "$logout_headers" | grep -i '^set-cookie: __Host-pressly-processor-session=' | head -n 1)"
  [[ "$cleared_session_cookie" == *'; Secure'* ]] || fail 'cleared processor session cookie is not Secure.'
  [[ "$cleared_session_cookie" == *'; HttpOnly'* ]] || fail 'cleared processor session cookie is not HttpOnly.'
  [[ "$cleared_session_cookie" == *'; SameSite=Strict'* ]] || fail 'cleared processor session cookie is not SameSite=Strict.'
  [[ "$cleared_session_cookie" == *'Expires=Thu, 01 Jan 1970 00:00:00 GMT'* ]] ||
    fail 'processor logout did not expire the session cookie.'

  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --cookie "$pre_logout_cookie_jar" \
    --output "$WORK_DIR/processor-revoked-session.json" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    "${origin}/api/processor/auth/session")"
  [[ "$status" == 401 ]] || fail "revoked processor session returned $status; expected 401."
  node --input-type=module - "$WORK_DIR/processor-revoked-session.json" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== false || response?.error?.code !== 'invalid_session')
  throw new Error('Processor session remained valid after logout.');
NODE
}

LPMS_LOCATION_ID='offline-smoke-location'
LPMS_FIRST_EXTERNAL_ORDER_ID='offline-smoke-order-prestart'
LPMS_FIRST_ORDER_CODE='OFFLINE-PRESTART-001'
LPMS_LIVE_EXTERNAL_ORDER_ID='offline-smoke-order-live'
LPMS_LIVE_ORDER_CODE='OFFLINE-LIVE-002'
LPMS_COOKIE_JAR="$WORK_DIR/lpms-processor-cookies.txt"
LPMS_CSRF_TOKEN=''
LPMS_FIRST_ORDER_ID=''
LPMS_LIVE_ORDER_ID=''
LPMS_SHIFT_ID=''
LPMS_SCHEDULE_RUN_ID=''
LPMS_OUTPUT_PLAN_HASH=''
LPMS_PRODUCTION_RUN_ID=''
LPMS_FIRST_UPDATED_AT=''
LPMS_LIVE_UPDATED_AT=''
LPMS_DUE_AT=''

login_lpms_processor_session() {
  local origin="https://processor.pressly.test:${CADDY_PORT}"
  local request_file="$WORK_DIR/lpms-login-request.json"
  local response_file="$WORK_DIR/lpms-login-response.json"
  OWNER_PASSWORD="$OWNER_PASSWORD" REQUEST_FILE="$request_file" \
    node --input-type=module -e "
      import { writeFileSync } from 'node:fs';
      writeFileSync(
        process.env.REQUEST_FILE,
        JSON.stringify({
          email: 'owner@offline.pressly.test',
          password: process.env.OWNER_PASSWORD,
        }),
        { flag: 'wx' },
      );
    "

  local status
  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --cookie-jar "$LPMS_COOKIE_JAR" \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1" \
    --header "Origin: $origin" \
    --header 'Content-Type: application/json' \
    --data-binary "@$request_file" \
    "${origin}/api/processor/auth/login")"
  [[ "$status" == 200 ]] || fail "LPMS Processor login returned $status; expected 200."

  LPMS_CSRF_TOKEN="$(node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== true || response?.data?.status !== 'authenticated')
  throw new Error('LPMS Processor login did not establish an authenticated session.');
if (typeof response.data.csrfToken !== 'string' || response.data.csrfToken.length !== 43)
  throw new Error('LPMS Processor login did not return a CSRF proof.');
process.stdout.write(response.data.csrfToken);
NODE
  )"
}

processor_request() {
  local method="$1"
  local path="$2"
  local request_file="$3"
  local response_file="$4"
  local expected_status="$5"
  local origin="https://processor.pressly.test:${CADDY_PORT}"
  [[ "$path" == /api/* ]] || fail "Processor proof path must stay behind /api: $path"

  local -a arguments=(
    --noproxy '*'
    --insecure
    --silent
    --show-error
    --cookie "$LPMS_COOKIE_JAR"
    --output "$response_file"
    --write-out '%{http_code}'
    --resolve "processor.pressly.test:${CADDY_PORT}:127.0.0.1"
    --request "$method"
  )
  if [[ "$method" != GET && "$method" != HEAD ]]; then
    arguments+=(--header "Origin: $origin" --header "X-CSRF-Token: $LPMS_CSRF_TOKEN")
  fi
  if [[ -n "$request_file" ]]; then
    arguments+=(--header 'Content-Type: application/json' --data-binary "@$request_file")
  fi

  local status
  status="$(curl "${arguments[@]}" "${origin}${path}")"
  if [[ "$status" != "$expected_status" ]]; then
    local error_summary
    error_summary="$(node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
try {
  const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const code = response?.error?.code;
  const message = response?.error?.message;
  process.stdout.write(
    typeof code === 'string' && typeof message === 'string'
      ? `code=${code}; message=${message}`
      : 'response did not contain a public API error',
  );
} catch {
  process.stdout.write('response was not valid JSON');
}
NODE
    )"
    fail "Processor $method $path returned $status; expected $expected_status; $error_summary."
  fi
  node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== true)
  throw new Error('Authenticated Processor command did not return an API success envelope.');
NODE
}

write_json_file() {
  local path="$1"
  local json="$2"
  JSON_VALUE="$json" JSON_PATH="$path" node --input-type=module -e "
    import { writeFileSync } from 'node:fs';
    const value = JSON.parse(process.env.JSON_VALUE);
    writeFileSync(process.env.JSON_PATH, JSON.stringify(value), { flag: 'wx' });
  "
}

wait_for_projection() {
  local external_order_id="$1"
  local expected_status="$2"
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    local state
    state="$(database_scalar "
      with projected as (
        select production_order.status
        from order_source_links source_link
        join order_fulfillments fulfillment
          on fulfillment.order_id = source_link.order_id
         and fulfillment.type_code = 'wash_fold'
        join order_demands demand
          on demand.fulfillment_id = fulfillment.id
        join production_orders production_order
          on production_order.order_demand_id = demand.id
        where source_link.source = 'cents'
          and source_link.external_order_id = '$external_order_id'
      )
      select concat(
        coalesce((select status from webhook_events where source = 'cents' and subject_type = 'order' and subject_id = '$external_order_id' limit 1), 'missing'),
        '|',
        coalesce((select status from projected limit 1), 'missing'),
        '|',
        (select count(*) from projected)
      );
    ")"
    if [[ "$state" == "processed|${expected_status}|1" ]]; then
      return
    fi
    sleep 1
  done
  fail "signed Cents event $external_order_id did not reach $expected_status within 60 seconds."
}

post_signed_cents_body() {
  local body_file="$1"
  local response_file="$2"
  local expected_ingress_status="$3"
  local timestamp signature status
  timestamp="$(date +%s)"
  signature="$(
    CENTS_TIMESTAMP="$timestamp" \
    CENTS_KEY="$PRESSLY_SMOKE_CENTS_HMAC_KEY" \
    CENTS_BODY_FILE="$body_file" \
      node --input-type=module -e "
        import { createHmac } from 'node:crypto';
        import { readFileSync } from 'node:fs';
        const body = readFileSync(process.env.CENTS_BODY_FILE);
        const digest = createHmac('sha256', process.env.CENTS_KEY)
          .update(process.env.CENTS_TIMESTAMP)
          .update('.')
          .update(body)
          .digest('hex');
        process.stdout.write('v1=' + digest);
      "
  )"
  status="$(curl \
    --noproxy '*' \
    --insecure \
    --silent \
    --show-error \
    --output "$response_file" \
    --write-out '%{http_code}' \
    --resolve "api.pressly.test:${CADDY_PORT}:127.0.0.1" \
    --header 'Content-Type: application/json' \
    --header "X-Cents-Timestamp: $timestamp" \
    --header "X-Cents-Signature: $signature" \
    --data-binary "@$body_file" \
    "https://api.pressly.test:${CADDY_PORT}/webhooks/cents")"
  [[ "$status" == 202 ]] || fail "signed Cents webhook returned $status; expected 202."
  EXPECTED_INGRESS_STATUS="$expected_ingress_status" \
    node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response?.ok !== true ||
  response?.data?.status !== process.env.EXPECTED_INGRESS_STATUS ||
  response?.data?.duplicate !== false
) throw new Error(`Signed Cents webhook did not create one new ${process.env.EXPECTED_INGRESS_STATUS} receipt.`);
NODE
}

send_signed_submitted_webhook() {
  local external_order_id="$1"
  local order_code="$2"
  local updated_at="$3"
  local due_at="$4"
  local body_file="$WORK_DIR/cents-${external_order_id}.json"
  local response_file="$WORK_DIR/cents-${external_order_id}-response.json"
  BODY_FILE="$body_file" EXTERNAL_ORDER_ID="$external_order_id" ORDER_CODE="$order_code" UPDATED_AT="$updated_at" DUE_AT="$due_at" \
    node --input-type=module -e "
      import { writeFileSync } from 'node:fs';
      writeFileSync(
        process.env.BODY_FILE,
        JSON.stringify({
          action: 'order_updated',
          order: {
            id: process.env.EXTERNAL_ORDER_ID,
            orderCode: process.env.ORDER_CODE,
            storeId: 'offline-smoke-store',
            status: 'SUBMITTED',
            dueDate: process.env.DUE_AT,
            updatedAt: process.env.UPDATED_AT,
          },
          services: [{
            id: 'offline-smoke-service',
            name: 'Synthetic Wash and Fold',
            quantity: 10,
            totalPrice: '20.00',
            unitCost: '2.00',
            serviceCategory: 'Wash and Fold',
            serviceCategoryType: 'LAUNDRY',
          }],
        }),
        { flag: 'wx' },
      );
    "
  post_signed_cents_body "$body_file" "$response_file" pending
}

wait_for_incoming_proposal() {
  local external_order_id="$1"
  local response_file="$2"
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    processor_request \
      GET \
      "/api/order-management/locations/${LPMS_LOCATION_ID}/incoming-orders?limit=50" \
      '' \
      "$response_file" \
      200
    local identity
    identity="$(
      EXPECTED_EXTERNAL_ORDER_ID="$external_order_id" \
        node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const matches = response.data.items.filter(
  (proposal) =>
    proposal.source === 'cents' &&
    proposal.externalOrderId === process.env.EXPECTED_EXTERNAL_ORDER_ID,
);
if (matches.length > 1)
  throw new Error('The exact Cents identity produced duplicate incoming proposals.');
if (matches.length === 1)
  process.stdout.write(`${matches[0].id}|${matches[0].version}`);
NODE
    )"
    if [[ -n "$identity" ]]; then
      printf '%s' "$identity"
      return
    fi
    sleep 1
  done
  fail "signed Cents submitted Order $external_order_id did not create one incoming proposal within 60 seconds."
}

accept_incoming_proposal() {
  local proposal_id="$1"
  local proposal_version="$2"
  local idempotency_key="$3"
  local request_file="$4"
  local response_file="$5"
  write_json_file \
    "$request_file" \
    "{\"expectedVersion\":${proposal_version},\"idempotencyKey\":\"${idempotency_key}\",\"reasonCode\":\"incoming_order_accepted\",\"reasonNote\":null}"
  processor_request \
    POST \
    "/api/order-management/locations/${LPMS_LOCATION_ID}/incoming-orders/${proposal_id}/accept" \
    "$request_file" \
    "$response_file" \
    200
  EXPECTED_PROPOSAL_ID="$proposal_id" node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response.data.proposalId !== process.env.EXPECTED_PROPOSAL_ID ||
  response.data.state !== 'accepted' ||
  response.data.version !== 2 ||
  response.data.replayed !== false ||
  typeof response.data.orderId !== 'string' ||
  typeof response.data.fulfillmentId !== 'string'
) throw new Error('Incoming proposal acceptance did not create one new canonical Order and fulfillment.');
NODE
}

release_accepted_fulfillment() {
  local acceptance_response_file="$1"
  local idempotency_key="$2"
  local request_file="$3"
  local response_file="$4"
  local accepted_identity order_id fulfillment_id
  accepted_identity="$(
    node --input-type=module - "$acceptance_response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  typeof response.data.orderId !== 'string' ||
  typeof response.data.fulfillmentId !== 'string'
) throw new Error('Accepted incoming Order is missing its canonical identity.');
process.stdout.write(`${response.data.orderId}|${response.data.fulfillmentId}`);
NODE
  )"
  IFS='|' read -r order_id fulfillment_id <<< "$accepted_identity"
  write_json_file \
    "$request_file" \
    "{\"expectedOrderVersion\":1,\"expectedFulfillmentVersion\":1,\"idempotencyKey\":\"${idempotency_key}\",\"reasonCode\":\"ready_for_production\",\"reasonNote\":null}"
  processor_request \
    POST \
    "/api/order-management/locations/${LPMS_LOCATION_ID}/fulfillments/${fulfillment_id}/release" \
    "$request_file" \
    "$response_file" \
    200
  EXPECTED_ORDER_ID="$order_id" EXPECTED_FULFILLMENT_ID="$fulfillment_id" \
    node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response.data.orderId !== process.env.EXPECTED_ORDER_ID ||
  response.data.fulfillmentId !== process.env.EXPECTED_FULFILLMENT_ID ||
  response.data.version !== 2 ||
  response.data.replayed !== false
) throw new Error('Canonical fulfillment release did not advance the accepted Order exactly once.');
NODE
}

prove_ignored_cents_events() {
  local before after
  before="$(database_scalar "
    select concat(
      (select count(*) from webhook_events),
      '|',
      (select count(*) from order_source_proposals),
      '|',
      (select count(*) from order_source_links),
      '|',
      (select count(*) from orders),
      '|',
      (select count(*) from production_orders)
    );
  ")"

  local ignored_order_body="$WORK_DIR/cents-ignored-order.json"
  local ignored_customer_body="$WORK_DIR/cents-ignored-customer.json"
  local ignored_marketing_body="$WORK_DIR/cents-ignored-marketing.json"
  write_json_file "$ignored_order_body" '{"action":"order_updated","order":{"id":"offline-smoke-ignored-order","status":"IN_PROGRESS","updatedAt":"2030-01-15T14:04:00.000Z"},"services":[{"malformed":true}]}'
  write_json_file "$ignored_customer_body" '{"event":"customer_updated","customer":{"id":"offline-smoke-ignored-customer","updatedAt":"2030-01-15T14:05:00.000Z"}}'
  write_json_file "$ignored_marketing_body" '{"event":"customer_marketing_optin","customer":{"id":"offline-smoke-ignored-marketing","updatedAt":"2030-01-15T14:06:00.000Z"}}'
  post_signed_cents_body "$ignored_order_body" "$WORK_DIR/cents-ignored-order-response.json" ignored
  post_signed_cents_body "$ignored_customer_body" "$WORK_DIR/cents-ignored-customer-response.json" ignored
  post_signed_cents_body "$ignored_marketing_body" "$WORK_DIR/cents-ignored-marketing-response.json" ignored

  after="$(database_scalar "
    select concat(
      (select count(*) from webhook_events),
      '|',
      (select count(*) from order_source_proposals),
      '|',
      (select count(*) from order_source_links),
      '|',
      (select count(*) from orders),
      '|',
      (select count(*) from production_orders)
    );
  ")"
  BEFORE_COUNTS="$before" AFTER_COUNTS="$after" node --input-type=module <<'NODE'
const before = process.env.BEFORE_COUNTS.split('|').map(Number);
const after = process.env.AFTER_COUNTS.split('|').map(Number);
if (
  after[0] !== before[0] + 3 ||
  after.slice(1).some((value, index) => value !== before[index + 1])
) throw new Error(`Ignored Cents receipts changed canonical work: ${process.env.BEFORE_COUNTS} -> ${process.env.AFTER_COUNTS}`);
NODE
  local ignored_receipts
  ignored_receipts="$(database_scalar "
    select count(*)
    from webhook_events
    where source = 'cents'
      and event_type in ('order_updated', 'customer_updated', 'customer_marketing_optin')
      and subject_type = 'unknown'
      and subject_id is null
      and payload_json is null
      and status = 'processed';
  ")"
  [[ "$ignored_receipts" == 3 ]] ||
    fail "ignored Cents proof did not retain exactly three minimal processed receipts: $ignored_receipts"
}

load_order_identity() {
  local display_reference="$1"
  local expected_status="$2"
  local response_file="$3"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/orders?status=${expected_status}&limit=50" \
    '' \
    "$response_file" \
    200
  EXPECTED_DISPLAY_REFERENCE="$display_reference" EXPECTED_STATUS="$expected_status" \
    node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const matches = response.data.items.filter(
  (order) => order.externalOrderId === process.env.EXPECTED_DISPLAY_REFERENCE,
);
if (matches.length !== 1 || matches[0].status !== process.env.EXPECTED_STATUS)
  throw new Error('The expected synthetic production order was not uniquely visible.');
process.stdout.write(`${matches[0].id}|${matches[0].version}`);
NODE
}

prepare_lpms_before_api_restart() {
  local -a lpms_times
  mapfile -t lpms_times < <(node --input-type=module - <<'NODE'
const now = Date.now();
for (const value of [
  new Date(now - 20 * 60_000),
  new Date(now - 10 * 60_000),
  new Date(now + 60 * 60_000),
  new Date(now - 5 * 60 * 60_000),
  new Date(now + 3 * 60 * 60_000),
]) console.log(value.toISOString());
NODE
  )
  (( ${#lpms_times[@]} == 5 )) || fail 'Could not establish synthetic LPMS timestamps.'
  LPMS_FIRST_UPDATED_AT="${lpms_times[0]}"
  LPMS_LIVE_UPDATED_AT="${lpms_times[1]}"
  LPMS_DUE_AT="${lpms_times[2]}"
  local shift_starts_at="${lpms_times[3]}"
  local shift_ends_at="${lpms_times[4]}"

  echo '[v2] proposing, accepting, and releasing the pre-Start signed Cents submitted Order before intake'
  send_signed_submitted_webhook \
    "$LPMS_FIRST_EXTERNAL_ORDER_ID" \
    "$LPMS_FIRST_ORDER_CODE" \
    "$LPMS_FIRST_UPDATED_AT" \
    "$LPMS_DUE_AT"

  login_lpms_processor_session
  local proposal_identity proposal_id proposal_version
  proposal_identity="$(wait_for_incoming_proposal \
    "$LPMS_FIRST_EXTERNAL_ORDER_ID" \
    "$WORK_DIR/lpms-prestart-incoming-orders.json")"
  IFS='|' read -r proposal_id proposal_version <<< "$proposal_identity"
  accept_incoming_proposal \
    "$proposal_id" \
    "$proposal_version" \
    offline-smoke-prestart-submitted-accept-v1 \
    "$WORK_DIR/lpms-prestart-proposal-accept-request.json" \
    "$WORK_DIR/lpms-prestart-proposal-accept-response.json"
  wait_for_projection "$LPMS_FIRST_EXTERNAL_ORDER_ID" release_pending
  release_accepted_fulfillment \
    "$WORK_DIR/lpms-prestart-proposal-accept-response.json" \
    offline-smoke-prestart-fulfillment-release-v1 \
    "$WORK_DIR/lpms-prestart-fulfillment-release-request.json" \
    "$WORK_DIR/lpms-prestart-fulfillment-release-response.json"
  wait_for_projection "$LPMS_FIRST_EXTERNAL_ORDER_ID" intake_pending

  local order_identity order_version
  order_identity="$(load_order_identity \
    "$LPMS_FIRST_ORDER_CODE" \
    intake_pending \
    "$WORK_DIR/lpms-prestart-orders.json")"
  IFS='|' read -r LPMS_FIRST_ORDER_ID order_version <<< "$order_identity"

  local priority_request="$WORK_DIR/lpms-prestart-priority-request.json"
  local priority_response="$WORK_DIR/lpms-prestart-priority-response.json"
  write_json_file "$priority_request" "{\"priority\":true,\"expectedVersion\":${order_version},\"idempotencyKey\":\"offline-smoke-prestart-priority-v1\"}"
  processor_request \
    PATCH \
    "/api/production/locations/${LPMS_LOCATION_ID}/orders/${LPMS_FIRST_ORDER_ID}/priority" \
    "$priority_request" \
    "$priority_response" \
    200
  order_version="$(node --input-type=module - "$priority_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.replayed !== false) throw new Error('Pre-Start priority unexpectedly replayed.');
process.stdout.write(String(response.data.version));
NODE
  )"

  local intake_request="$WORK_DIR/lpms-prestart-intake-request.json"
  local intake_response="$WORK_DIR/lpms-prestart-intake-response.json"
  write_json_file "$intake_request" "{\"bagCount\":1,\"expectedVersion\":${order_version},\"idempotencyKey\":\"offline-smoke-prestart-intake-v1\"}"
  processor_request \
    PUT \
    "/api/production/locations/${LPMS_LOCATION_ID}/orders/${LPMS_FIRST_ORDER_ID}/intake" \
    "$intake_request" \
    "$intake_response" \
    200
  wait_for_projection "$LPMS_FIRST_EXTERNAL_ORDER_ID" eligible

  local initial_workspace="$WORK_DIR/lpms-initial-workspace.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/workspace" \
    '' \
    "$initial_workspace" \
    200
  local scheduler_config_id
  scheduler_config_id="$(EXPECTED_ORDER_ID="$LPMS_FIRST_ORDER_ID" node --input-type=module - "$initial_workspace" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const config = response.data.currentSchedulerConfig;
if (config?.algorithmVersion !== 'fixed-pulse-ffd-v2')
  throw new Error('The current scheduler configuration is not fixed-pulse-ffd-v2.');
const order = response.data.pendingEligibleOrders.find(
  (candidate) => candidate.id === process.env.EXPECTED_ORDER_ID,
);
if (order?.priority !== true || order?.placement?.status !== 'awaiting_run')
  throw new Error('Pre-Start intake did not persist priority and awaiting-run placement state.');
process.stdout.write(config.id);
NODE
  )"

  echo '[v2] creating an active synthetic shift and executing Select -> Compute -> Accept without execution rows'
  local shift_request="$WORK_DIR/lpms-shift-request.json"
  local shift_response="$WORK_DIR/lpms-shift-response.json"
  write_json_file "$shift_request" "{\"startsAt\":\"${shift_starts_at}\",\"endsAt\":\"${shift_ends_at}\",\"timezone\":\"America/New_York\",\"effectiveFolderCount\":2,\"idempotencyKey\":\"offline-smoke-shift-v1\"}"
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/shifts" \
    "$shift_request" \
    "$shift_response" \
    201
  LPMS_SHIFT_ID="$(node --input-type=module - "$shift_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const now = Date.now();
if (!(Date.parse(response.data.startsAt) <= now && now < Date.parse(response.data.endsAt)))
  throw new Error('The synthetic shift must be active for scheduling proof.');
process.stdout.write(response.data.id);
NODE
  )"

  local selection_request="$WORK_DIR/lpms-selection-request.json"
  local selection_response="$WORK_DIR/lpms-selection-response.json"
  write_json_file "$selection_request" "{\"selectedOrderIds\":[\"${LPMS_FIRST_ORDER_ID}\"],\"expectedVersion\":0,\"idempotencyKey\":\"offline-smoke-selection-v1\"}"
  processor_request \
    PUT \
    "/api/production/locations/${LPMS_LOCATION_ID}/shifts/${LPMS_SHIFT_ID}/selection" \
    "$selection_request" \
    "$selection_response" \
    200
  EXPECTED_ORDER_ID="$LPMS_FIRST_ORDER_ID" EXPECTED_SHIFT_ID="$LPMS_SHIFT_ID" \
    node --input-type=module - "$selection_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const selection = response.data.selection;
if (
  selection.productionShiftId !== process.env.EXPECTED_SHIFT_ID ||
  selection.version !== 1 ||
  selection.selectedOrderIds.length !== 1 ||
  selection.selectedOrderIds[0] !== process.env.EXPECTED_ORDER_ID ||
  response.data.replayed !== false
) throw new Error('The explicit shift selection did not persist the ready order.');
NODE

  local compute_request="$WORK_DIR/lpms-compute-request.json"
  local compute_response="$WORK_DIR/lpms-compute-response.json"
  write_json_file "$compute_request" "{\"productionShiftId\":\"${LPMS_SHIFT_ID}\",\"schedulerConfigId\":\"${scheduler_config_id}\",\"idempotencyKey\":\"offline-smoke-compute-v2\"}"
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/schedules" \
    "$compute_request" \
    "$compute_response" \
    201
  local schedule_identity
  schedule_identity="$(EXPECTED_ORDER_ID="$LPMS_FIRST_ORDER_ID" node --input-type=module - "$compute_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const schedule = response.data;
if (
  schedule.status !== 'draft' ||
  schedule.algorithmVersion !== 'fixed-pulse-ffd-v2' ||
  schedule.batches.length !== 1 ||
  schedule.batches[0].orderIds.length !== 1 ||
  schedule.batches[0].orderIds[0] !== process.env.EXPECTED_ORDER_ID ||
  schedule.unplacedOrderIds.length !== 0 ||
  schedule.warnings.length !== 0
) throw new Error('Compute did not produce the expected complete one-order proposal.');
process.stdout.write(`${schedule.scheduleRunId}|${schedule.outputPlanHash}`);
NODE
  )"
  IFS='|' read -r LPMS_SCHEDULE_RUN_ID LPMS_OUTPUT_PLAN_HASH <<< "$schedule_identity"

  local accept_request="$WORK_DIR/lpms-accept-request.json"
  local accept_response="$WORK_DIR/lpms-accept-response.json"
  write_json_file "$accept_request" "{\"expectedOutputPlanHash\":\"${LPMS_OUTPUT_PLAN_HASH}\",\"acknowledgedWarningCodes\":[],\"idempotencyKey\":\"offline-smoke-accept-v2\"}"
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/schedules/${LPMS_SCHEDULE_RUN_ID}/accept" \
    "$accept_request" \
    "$accept_response" \
    201
  EXPECTED_SCHEDULE_RUN_ID="$LPMS_SCHEDULE_RUN_ID" node --input-type=module - "$accept_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.scheduleRunId !== process.env.EXPECTED_SCHEDULE_RUN_ID || response.data.replayed !== false)
  throw new Error('Accept did not persist the expected current plan.');
NODE

  local prestart_state
  prestart_state="$(database_scalar "
    select concat(
      (select status from schedule_runs where id = '${LPMS_SCHEDULE_RUN_ID}'),
      '|',
      (select count(*) from production_runs where production_shift_id = '${LPMS_SHIFT_ID}'),
      '|',
      (select status from production_orders where id = '${LPMS_FIRST_ORDER_ID}'),
      '|',
      (select count(*) from production_bags where production_order_id = '${LPMS_FIRST_ORDER_ID}')
    );
  ")"
  [[ "$prestart_state" == 'accepted|0|eligible|1' ]] ||
    fail "Accept created or lost execution state before Start: $prestart_state"
}

resume_lpms_after_api_restart() {
  echo '[v2] restoring the Processor cookie after API restart, refreshing accepted backend state, and starting once'
  local session_response="$WORK_DIR/lpms-restored-session.json"
  processor_request GET /api/processor/auth/session '' "$session_response" 200
  EXPECTED_CSRF_TOKEN="$LPMS_CSRF_TOKEN" node --input-type=module - "$session_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.status !== 'authenticated' || response.data.csrfToken !== process.env.EXPECTED_CSRF_TOKEN)
  throw new Error('API restart did not restore the authenticated Processor session and CSRF proof.');
NODE

  local workspace_response="$WORK_DIR/lpms-accepted-workspace.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/workspace?shiftId=${LPMS_SHIFT_ID}" \
    '' \
    "$workspace_response" \
    200
  EXPECTED_SHIFT_ID="$LPMS_SHIFT_ID" EXPECTED_SCHEDULE_RUN_ID="$LPMS_SCHEDULE_RUN_ID" \
    EXPECTED_ORDER_ID="$LPMS_FIRST_ORDER_ID" node --input-type=module - "$workspace_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response.data.currentShift?.id !== process.env.EXPECTED_SHIFT_ID ||
  response.data.currentScheduleProposal?.scheduleRunId !== process.env.EXPECTED_SCHEDULE_RUN_ID ||
  response.data.currentScheduleProposal?.status !== 'accepted' ||
  response.data.activeRuns.length !== 0 ||
  !response.data.pendingEligibleOrders.some((order) => order.id === process.env.EXPECTED_ORDER_ID)
) throw new Error('Accepted plan did not survive API restart and explicit shift refresh.');
NODE

  local start_request="$WORK_DIR/lpms-start-request.json"
  local start_response="$WORK_DIR/lpms-start-response.json"
  write_json_file "$start_request" "{\"expectedOutputPlanHash\":\"${LPMS_OUTPUT_PLAN_HASH}\",\"idempotencyKey\":\"offline-smoke-start-v2\"}"
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/schedules/${LPMS_SCHEDULE_RUN_ID}/start" \
    "$start_request" \
    "$start_response" \
    201
  LPMS_PRODUCTION_RUN_ID="$(EXPECTED_SCHEDULE_RUN_ID="$LPMS_SCHEDULE_RUN_ID" node --input-type=module - "$start_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response.data.scheduleRunId !== process.env.EXPECTED_SCHEDULE_RUN_ID ||
  response.data.productionBatchIds.length !== 1 ||
  response.data.queueVersion !== 1 ||
  response.data.replayed !== false
) throw new Error('Start did not create exactly one initial started run and batch.');
process.stdout.write(response.data.productionRunId);
NODE
  )"

  local board_response="$WORK_DIR/lpms-board-after-start.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/board" \
    '' \
    "$board_response" \
    200
  EXPECTED_RUN_ID="$LPMS_PRODUCTION_RUN_ID" EXPECTED_ORDER_ID="$LPMS_FIRST_ORDER_ID" \
    node --input-type=module - "$board_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const board = response.data;
if (
  board.productionRun.id !== process.env.EXPECTED_RUN_ID ||
  board.productionRun.status !== 'started' ||
  board.batches.length !== 1 ||
  board.batches[0].orders.length !== 1 ||
  board.batches[0].orders[0].id !== process.env.EXPECTED_ORDER_ID ||
  board.batches[0].orders[0].placementProvenance !== 'initial_schedule'
) throw new Error('The direct run-ID board did not resume the initial started run.');
NODE
}

fast_forward_started_stage() {
  local stage_run_id="$1"
  local stage_kind="$2"
  local expected_assignments=0
  [[ "$stage_kind" == washing || "$stage_kind" == drying ]] && expected_assignments=1
  local changed
  changed="$(database_scalar "
    with changed_stage as (
      update stage_runs
      set actual_start_at = planned_start_at
      where id = '${stage_run_id}' and status = 'started'
      returning id
    ), changed_assignments as (
      update stage_machine_assignments
      set actual_start_at = planned_start_at
      where stage_run_id = '${stage_run_id}' and status = 'active'
      returning id
    )
    select concat(
      (select count(*) from changed_stage),
      '|',
      (select count(*) from changed_assignments)
    );
  ")"
  [[ "$changed" == "1|${expected_assignments}" ]] ||
    fail "synthetic stage clock advance was incomplete for $stage_kind: $changed"
}

finish_lpms_live_flow() {
  echo '[v2] proposing, accepting, and releasing the post-Start signed submitted Order before intake and compatible placement'
  send_signed_submitted_webhook \
    "$LPMS_LIVE_EXTERNAL_ORDER_ID" \
    "$LPMS_LIVE_ORDER_CODE" \
    "$LPMS_LIVE_UPDATED_AT" \
    "$LPMS_DUE_AT"
  local proposal_identity proposal_id proposal_version
  proposal_identity="$(wait_for_incoming_proposal \
    "$LPMS_LIVE_EXTERNAL_ORDER_ID" \
    "$WORK_DIR/lpms-live-incoming-orders.json")"
  IFS='|' read -r proposal_id proposal_version <<< "$proposal_identity"
  accept_incoming_proposal \
    "$proposal_id" \
    "$proposal_version" \
    offline-smoke-live-submitted-accept-v1 \
    "$WORK_DIR/lpms-live-proposal-accept-request.json" \
    "$WORK_DIR/lpms-live-proposal-accept-response.json"
  wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" release_pending
  release_accepted_fulfillment \
    "$WORK_DIR/lpms-live-proposal-accept-response.json" \
    offline-smoke-live-fulfillment-release-v1 \
    "$WORK_DIR/lpms-live-fulfillment-release-request.json" \
    "$WORK_DIR/lpms-live-fulfillment-release-response.json"
  wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" intake_pending

  local order_identity order_version
  order_identity="$(load_order_identity \
    "$LPMS_LIVE_ORDER_CODE" \
    intake_pending \
    "$WORK_DIR/lpms-live-orders.json")"
  IFS='|' read -r LPMS_LIVE_ORDER_ID order_version <<< "$order_identity"

  local priority_request="$WORK_DIR/lpms-live-priority-request.json"
  local priority_response="$WORK_DIR/lpms-live-priority-response.json"
  write_json_file "$priority_request" "{\"priority\":true,\"expectedVersion\":${order_version},\"idempotencyKey\":\"offline-smoke-live-priority-v1\"}"
  processor_request \
    PATCH \
    "/api/production/locations/${LPMS_LOCATION_ID}/orders/${LPMS_LIVE_ORDER_ID}/priority" \
    "$priority_request" \
    "$priority_response" \
    200
  order_version="$(node --input-type=module - "$priority_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(String(response.data.version));
NODE
  )"

  local intake_request="$WORK_DIR/lpms-live-intake-request.json"
  local intake_response="$WORK_DIR/lpms-live-intake-response.json"
  write_json_file "$intake_request" "{\"bagCount\":1,\"expectedVersion\":${order_version},\"idempotencyKey\":\"offline-smoke-live-intake-v1\"}"
  processor_request \
    PUT \
    "/api/production/locations/${LPMS_LOCATION_ID}/orders/${LPMS_LIVE_ORDER_ID}/intake" \
    "$intake_request" \
    "$intake_response" \
    200
  wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" eligible

  local placement_request="$WORK_DIR/lpms-live-placement-request.json"
  local placement_response="$WORK_DIR/lpms-live-placement-response.json"
  write_json_file "$placement_request" '{"expectedQueueVersion":1,"idempotencyKey":"offline-smoke-live-placement-v1"}'
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/orders/${LPMS_LIVE_ORDER_ID}/place" \
    "$placement_request" \
    "$placement_response" \
    200
  EXPECTED_RUN_ID="$LPMS_PRODUCTION_RUN_ID" EXPECTED_ORDER_ID="$LPMS_LIVE_ORDER_ID" \
    node --input-type=module - "$placement_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (
  response.data.status !== 'placed' ||
  response.data.mode !== 'automatic' ||
  response.data.productionRunId !== process.env.EXPECTED_RUN_ID ||
  response.data.productionOrderId !== process.env.EXPECTED_ORDER_ID ||
  response.data.queueVersion !== 2 ||
  response.data.replayed !== false
) throw new Error('The explicit compatible-placement request did not place the live order.');
NODE
  wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" scheduled

  local placed_board="$WORK_DIR/lpms-board-after-live-placement.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/board" \
    '' \
    "$placed_board" \
    200
  local freeze_identity
  freeze_identity="$(EXPECTED_FIRST_ORDER_ID="$LPMS_FIRST_ORDER_ID" EXPECTED_LIVE_ORDER_ID="$LPMS_LIVE_ORDER_ID" \
    node --input-type=module - "$placed_board" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const board = response.data;
if (board.productionRun.queueVersion !== 2 || board.batches.length !== 1 || board.eligibleOrders.length !== 0)
  throw new Error('Automatic live placement did not produce one stable queue mutation.');
const orders = board.batches[0].orders;
const first = orders.find((order) => order.id === process.env.EXPECTED_FIRST_ORDER_ID);
const live = orders.find((order) => order.id === process.env.EXPECTED_LIVE_ORDER_ID);
if (
  orders.length !== 2 ||
  first?.priority !== true ||
  first?.placementProvenance !== 'initial_schedule' ||
  live?.priority !== true ||
  live?.placementProvenance !== 'automatic'
) throw new Error('Live order placement provenance or priority is incorrect.');
process.stdout.write(`${board.productionRun.queueVersion}|${board.batches[0].id}|${board.batches[0].version}`);
NODE
  )"
  local queue_version batch_id batch_version
  IFS='|' read -r queue_version batch_id batch_version <<< "$freeze_identity"

  echo '[v2] explicitly freezing the mutable batch through the versioned queue command'
  local freeze_request="$WORK_DIR/lpms-freeze-request.json"
  local freeze_response="$WORK_DIR/lpms-freeze-response.json"
  write_json_file "$freeze_request" "{\"expectedQueueVersion\":${queue_version},\"expectedBatchVersion\":${batch_version},\"idempotencyKey\":\"offline-smoke-freeze-v1\"}"
  processor_request \
    POST \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/batches/${batch_id}/freeze" \
    "$freeze_request" \
    "$freeze_response" \
    200
  node --input-type=module - "$freeze_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.membership?.state !== 'frozen' || response.data.replayed !== false)
  throw new Error('Explicit batch freeze did not commit frozen membership.');
NODE

  local frozen_board="$WORK_DIR/lpms-board-after-freeze.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/board" \
    '' \
    "$frozen_board" \
    200
  local -a stage_rows
  mapfile -t stage_rows < <(node --input-type=module - "$frozen_board" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const batch = response.data.batches[0];
const expected = ['sorting', 'washing', 'drying', 'folding_packaging'];
if (batch?.membership?.state !== 'frozen' || batch.stages.map((stage) => stage.stage).join('|') !== expected.join('|'))
  throw new Error('Frozen batch does not expose the canonical four-stage pipeline.');
for (const stage of batch.stages) console.log(`${stage.id}|${stage.stage}|${stage.version}`);
NODE
  )
  (( ${#stage_rows[@]} == 4 )) || fail 'The LPMS batch did not contain exactly four stages.'

  echo '[v2] driving all four stage start/complete transitions through Processor; disposable SQL advances only synthetic elapsed time'
  local row stage_id stage_kind stage_version
  for row in "${stage_rows[@]}"; do
    IFS='|' read -r stage_id stage_kind stage_version <<< "$row"
    local start_request="$WORK_DIR/lpms-stage-${stage_kind}-start-request.json"
    local start_response="$WORK_DIR/lpms-stage-${stage_kind}-start-response.json"
    write_json_file "$start_request" "{\"expectedVersion\":${stage_version},\"idempotencyKey\":\"offline-smoke-stage-${stage_kind}-start-v1\"}"
    processor_request \
      POST \
      "/api/production/locations/${LPMS_LOCATION_ID}/stages/${stage_id}/start" \
      "$start_request" \
      "$start_response" \
      200
    stage_version="$(EXPECTED_STAGE_ID="$stage_id" node --input-type=module - "$start_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.entityId !== process.env.EXPECTED_STAGE_ID || response.data.replayed !== false)
  throw new Error('Stage start did not mutate the expected stage.');
process.stdout.write(String(response.data.version));
NODE
    )"

    fast_forward_started_stage "$stage_id" "$stage_kind"

    local complete_request="$WORK_DIR/lpms-stage-${stage_kind}-complete-request.json"
    local complete_response="$WORK_DIR/lpms-stage-${stage_kind}-complete-response.json"
    write_json_file "$complete_request" "{\"expectedVersion\":${stage_version},\"idempotencyKey\":\"offline-smoke-stage-${stage_kind}-complete-v1\"}"
    processor_request \
      POST \
      "/api/production/locations/${LPMS_LOCATION_ID}/stages/${stage_id}/complete" \
      "$complete_request" \
      "$complete_response" \
      200
    EXPECTED_STAGE_ID="$stage_id" node --input-type=module - "$complete_response" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.entityId !== process.env.EXPECTED_STAGE_ID || response.data.replayed !== false)
  throw new Error('Stage completion did not mutate the expected stage.');
NODE
  done

  echo '[v2] resuming the completed board directly by production run ID and checking durable execution state'
  local completed_board="$WORK_DIR/lpms-completed-board.json"
  processor_request \
    GET \
    "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/board" \
    '' \
    "$completed_board" \
    200
  EXPECTED_RUN_ID="$LPMS_PRODUCTION_RUN_ID" EXPECTED_FIRST_ORDER_ID="$LPMS_FIRST_ORDER_ID" \
    EXPECTED_LIVE_ORDER_ID="$LPMS_LIVE_ORDER_ID" node --input-type=module - "$completed_board" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const board = response.data;
const batch = board.batches[0];
const orderIds = new Set(batch?.orders.map((order) => order.id));
if (
  board.productionRun.id !== process.env.EXPECTED_RUN_ID ||
  board.productionRun.status !== 'completed' ||
  board.batches.length !== 1 ||
  batch.status !== 'finished' ||
  batch.membership.state !== 'frozen' ||
  orderIds.size !== 2 ||
  !orderIds.has(process.env.EXPECTED_FIRST_ORDER_ID) ||
  !orderIds.has(process.env.EXPECTED_LIVE_ORDER_ID) ||
  batch.stages.some((stage) => stage.status !== 'completed' || stage.allowedActions.length !== 0) ||
  board.eligibleOrders.length !== 0
) throw new Error('The completed run-ID board did not preserve the full execution history.');
NODE

  local durable_state
  durable_state="$(database_scalar "
    select concat(
      (select count(*) from webhook_events where source = 'cents' and subject_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')),
      '|',
      (select count(*) from order_source_proposals where source = 'cents' and external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')),
      '|',
      (select count(*)
       from order_source_proposal_resolutions resolution
       join order_source_proposals proposal on proposal.id = resolution.proposal_id
       where proposal.source = 'cents'
         and proposal.external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')
         and resolution.decision = 'accepted'),
      '|',
      (select count(*)
       from order_demands demand
       join order_fulfillments fulfillment on fulfillment.id = demand.fulfillment_id
       join order_source_links source_link on source_link.order_id = fulfillment.order_id
       where source_link.source = 'cents'
         and source_link.external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')
         and fulfillment.type_code = 'wash_fold'),
      '|',
      (select count(*) from production_orders where id in ('${LPMS_FIRST_ORDER_ID}', '${LPMS_LIVE_ORDER_ID}') and status = 'finished' and priority = true and bag_count = 1),
      '|',
      (select count(*) from production_bags where production_order_id in ('${LPMS_FIRST_ORDER_ID}', '${LPMS_LIVE_ORDER_ID}') and status = 'finished'),
      '|',
      (select count(*) from schedule_runs where id = '${LPMS_SCHEDULE_RUN_ID}' and status = 'accepted'),
      '|',
      (select count(*) from production_runs where id = '${LPMS_PRODUCTION_RUN_ID}' and production_shift_id = '${LPMS_SHIFT_ID}' and status = 'completed'),
      '|',
      (select count(*) from production_batches where production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and status = 'finished' and membership_frozen_at is not null and membership_frozen_by is not null),
      '|',
      (select count(*) from stage_runs stage join production_batches batch on batch.id = stage.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and stage.status = 'completed'),
      '|',
      (select count(*) from production_batch_orders link join production_batches batch on batch.id = link.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}'),
      '|',
      (select count(*) from production_batch_orders link join production_batches batch on batch.id = link.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and link.placement_provenance = 'automatic'),
      '|',
      (select count(*) from work_events event join stage_runs stage on stage.id = event.entity_id join production_batches batch on batch.id = stage.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and event.event_type = 'stage_started'),
      '|',
      (select count(*) from work_events event join stage_runs stage on stage.id = event.entity_id join production_batches batch on batch.id = stage.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and event.event_type = 'stage_completed')
    );
  ")"
  [[ "$durable_state" == '2|2|2|2|2|2|1|1|1|4|2|1|4|4' ]] ||
    fail "completed LPMS persistence graph is inconsistent: $durable_state"
}

echo '[v2] starting a clean Postgres volume and applying all migrations'
compose up -d --wait --wait-timeout 120 postgres
run_migrations
[[ "$(database_scalar 'select (select count(*) from webhook_events) + (select count(*) from production_orders);')" == 0 ]] ||
  fail 'clean migration unexpectedly contained runtime demand or production rows.'

echo '[v2] applying the explicit synthetic facility bootstrap fixture'
compose --profile tools run --rm --workdir /repo migrate \
  node apps/cli/dist/commands/bootstrap-production.command.js \
  --file /repo/tooling/fixtures/production-topology/production-bootstrap.json \
  --actor-id 00000000-0000-4000-8000-000000000901 \
  --idempotency-key offline-smoke-bootstrap-v1 \
  --apply >/dev/null

echo '[v2] bootstrapping one synthetic owner through the password-stdin boundary'
printf '%s\n' "$OWNER_PASSWORD" | \
  compose --profile tools run --rm -T \
    --env PRESSLY_BOOTSTRAP_OWNER_EMAIL=owner@offline.pressly.test \
    --env PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner \
    --workdir /repo \
    migrate \
    node modules/business/auth/dist/bootstrap-owner/bootstrap-owner.command.js \
    --password-stdin >/dev/null

echo '[v2] starting release-a and proving Caddy routes'
compose up -d --wait --wait-timeout 180 api web worker processor caddy
assert_release_images release-a
probe_routes
echo '[v2] proving production HTTPS cookie, session restoration, and CSRF behavior through Caddy'
prove_processor_cookie_auth
echo '[v2] proving unsupported-order, customer, and marketing Cents events retain only ignored durable receipts'
prove_ignored_cents_events

INITIAL_HEARTBEAT="$(compose exec -T worker sh -c 'cat "${WORKER_HEARTBEAT_FILE:-/tmp/pressly-worker-heartbeat}"')"
[[ -n "$INITIAL_HEARTBEAT" ]] || fail 'Worker heartbeat file is empty.'

prepare_lpms_before_api_restart

echo '[v2] restarting API after Accept and proving backend-derived refresh before Start'
API_STARTED_BEFORE="$(docker inspect --format '{{.State.StartedAt}}' "$(compose ps -q api)")"
compose restart api >/dev/null
wait_for_health api
API_STARTED_AFTER="$(docker inspect --format '{{.State.StartedAt}}' "$(compose ps -q api)")"
[[ "$API_STARTED_AFTER" != "$API_STARTED_BEFORE" ]] || fail 'API restart did not change its start time.'
probe_ok api.pressly.test /health/ready
probe_ok processor.pressly.test /api/health/ready
resume_lpms_after_api_restart

echo '[v2] restarting Worker independently before the live-arrival proof'
WORKER_HEARTBEAT_BEFORE="$(compose exec -T worker sh -c 'cat "${WORKER_HEARTBEAT_FILE:-/tmp/pressly-worker-heartbeat}"')"
compose restart worker >/dev/null
wait_for_health worker
HEARTBEAT_DEADLINE=$((SECONDS + 30))
WORKER_HEARTBEAT_AFTER="$WORKER_HEARTBEAT_BEFORE"
while ((SECONDS < HEARTBEAT_DEADLINE)); do
  WORKER_HEARTBEAT_AFTER="$(compose exec -T worker sh -c 'cat "${WORKER_HEARTBEAT_FILE:-/tmp/pressly-worker-heartbeat}"')"
  [[ "$WORKER_HEARTBEAT_AFTER" != "$WORKER_HEARTBEAT_BEFORE" ]] && break
  sleep 1
done
[[ "$WORKER_HEARTBEAT_AFTER" != "$WORKER_HEARTBEAT_BEFORE" ]] ||
  fail 'Worker heartbeat did not advance after restart.'

finish_lpms_live_flow

promote_metadata "$RELEASE_A_SOURCE"

echo '[v2] migrating and switching all four applications to synthetic release-b'
set_release release-b
run_migrations
compose up -d --force-recreate --wait --wait-timeout 180 api web worker processor
assert_release_images release-b
probe_routes
wait_for_projection "$LPMS_FIRST_EXTERNAL_ORDER_ID" finished
wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" finished
promote_metadata "$RELEASE_B_SOURCE"
assert_metadata "$RELEASE_B_SOURCE" release-b "$RELEASE_A_SOURCE" release-a

echo '[v2] rolling all four applications back to release-a without invoking deploy.sh or Git'
set_release release-a
run_migrations
compose up -d --force-recreate --wait --wait-timeout 180 api web worker processor
assert_release_images release-a
probe_routes
wait_for_projection "$LPMS_FIRST_EXTERNAL_ORDER_ID" finished
wait_for_projection "$LPMS_LIVE_EXTERNAL_ORDER_ID" finished
swap_metadata_for_rollback
assert_metadata "$RELEASE_A_SOURCE" release-a "$RELEASE_B_SOURCE" release-b

processor_request \
  GET \
  "/api/production/locations/${LPMS_LOCATION_ID}/runs/${LPMS_PRODUCTION_RUN_ID}/board" \
  '' \
  "$WORK_DIR/lpms-board-after-rollback.json" \
  200
EXPECTED_RUN_ID="$LPMS_PRODUCTION_RUN_ID" \
  node --input-type=module - "$WORK_DIR/lpms-board-after-rollback.json" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response.data.productionRun?.id !== process.env.EXPECTED_RUN_ID || response.data.productionRun.status !== 'completed')
  throw new Error('The completed run-ID board did not survive release rotation and rollback.');
NODE

RUNTIME_COUNTS="$(database_scalar "
  select concat(
    (select count(*) from webhook_events where source = 'cents' and subject_type = 'order' and subject_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')),
    '|',
    (select count(*) from webhook_events where source = 'cents' and subject_type = 'unknown' and payload_json is null and status = 'processed'),
    '|',
    (select count(*) from order_source_proposals where source = 'cents' and external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')),
    '|',
    (select count(*)
     from order_source_proposal_resolutions resolution
     join order_source_proposals proposal on proposal.id = resolution.proposal_id
     where proposal.source = 'cents'
       and proposal.external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')
       and resolution.decision = 'accepted'),
    '|',
    (select count(*)
     from production_orders production_order
     join order_demands demand on demand.id = production_order.order_demand_id
     join order_fulfillments fulfillment on fulfillment.id = demand.fulfillment_id
     join order_source_links source_link on source_link.order_id = fulfillment.order_id
     where source_link.source = 'cents'
       and source_link.external_order_id in ('${LPMS_FIRST_EXTERNAL_ORDER_ID}', '${LPMS_LIVE_EXTERNAL_ORDER_ID}')
       and fulfillment.type_code = 'wash_fold'),
    '|',
    (select count(*) from production_orders where id in ('${LPMS_FIRST_ORDER_ID}', '${LPMS_LIVE_ORDER_ID}') and status = 'finished'),
    '|',
    (select count(*) from production_runs where id = '${LPMS_PRODUCTION_RUN_ID}' and status = 'completed'),
    '|',
    (select count(*) from stage_runs stage join production_batches batch on batch.id = stage.production_batch_id where batch.production_run_id = '${LPMS_PRODUCTION_RUN_ID}' and stage.status = 'completed')
  );
")"
[[ "$RUNTIME_COUNTS" == '2|3|2|2|2|2|1|4' ]] || fail "rollback duplicated or lost durable LPMS state: $RUNTIME_COUNTS"

echo '[v2] capturing one steady-state memory snapshot for the complete private stack'
mapfile -t CONTAINER_IDS < <(compose ps -q)
(( ${#CONTAINER_IDS[@]} >= 6 )) || fail 'expected at least six running topology containers.'
docker stats --no-stream --format json "${CONTAINER_IDS[@]}" > "$WORK_DIR/docker-stats.jsonl"
node "$ROOT_DIR/tooling/scripts/docker-stats-report.mjs" "$WORK_DIR/docker-stats.jsonl" > "$WORK_DIR/memory.json"

node --input-type=module - \
  "$WORK_DIR/memory.json" \
  "$WORK_DIR/current-release.json" \
  "$WORK_DIR/previous-release.json" \
  "$REPORT_PATH" \
  "$PROJECT_NAME" \
  "$CADDY_PORT" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';

const [memoryPath, currentPath, previousPath, reportPath, project, caddyPort] = process.argv.slice(2);
const report = {
  proof: 'lpms-v2-offline-production-topology',
  completedAt: new Date().toISOString(),
  project,
  dockerScope: 'local-unix-context',
  ingress: {
    bind: `https://127.0.0.1:${caddyPort}`,
    onlyCaddyPublished: true,
    localTls: 'Caddy internal CA with curl certificate verification disabled only for this disposable proof.',
    routes: ['web:/health', 'api:/health/ready', 'processor:/', 'processor:/api/health/ready', 'processor:/api/processor/auth/session', 'processor:/api/order-management/locations/:locationId/incoming-orders', 'processor:/api/order-management/locations/:locationId/fulfillments/:fulfillmentId/release', 'processor:/api/production/locations/:locationId/runs/:productionRunId/board'],
  },
  database: {
    cleanMigration: true,
    explicitSyntheticBootstrap: true,
    signedSubmittedReceiptCount: 2,
    ignoredReceiptCount: 3,
    incomingProposalCount: 2,
    acceptedProposalCount: 2,
    projectedOrderCount: 2,
    projectionStatus: 'finished',
    productionRunCount: 1,
    completedStageCount: 4,
    stageTransitionCommandCount: 8,
  },
  recovery: {
    apiRestartHealthy: true,
    workerRestartHeartbeatAdvanced: true,
  },
  processorAuthentication: {
    loginThroughCaddy: true,
    secureHttpOnlyStrictHostCookie: true,
    sessionRestoredFromCookie: true,
    sessionSurvivedApiRestart: true,
    missingCsrfRejected: true,
    validCsrfLogoutAccepted: true,
    revokedSessionRejected: true,
  },
  lpmsWorkflow: {
    transport: 'Authenticated Processor cookie and CSRF commands through loopback-only Caddy.',
    ingressBoundary: ['signed exact SUBMITTED candidate', 'operator acceptance', 'canonical fulfillment release'],
    ignoredIngress: ['unsupported lifecycle order', 'customer event', 'marketing event'],
    preStart: ['signed Cents submitted candidate', 'accept into Pressly', 'release fulfillment', 'priority', 'intake', 'Compute', 'Accept schedule', 'API restart', 'backend refresh', 'Start'],
    postStart: ['signed Cents submitted candidate', 'accept into Pressly', 'release fulfillment', 'priority', 'intake', 'automatic placement', 'explicit freeze'],
    stageTransitions: ['sorting', 'washing', 'drying', 'folding_packaging'],
    completedRun: true,
    directRunIdBoardResume: true,
    durableDatabaseAssertions: true,
    syntheticTimeControl: 'The past shift establishes planned boundaries. After each authenticated stage start, only the disposable stage actual-start timestamps are set to their planned boundaries before the authenticated completion command.',
  },
  releaseExercise: {
    switchedAllFourToReleaseB: true,
    rolledBackAllFourToReleaseA: true,
    current: JSON.parse(readFileSync(currentPath, 'utf8')),
    previous: JSON.parse(readFileSync(previousPath, 'utf8')),
    content: 'Both synthetic release identities point to the same current-tree build under distinct local tags.',
    historicalBinaryCompatibilityProven: false,
  },
  memory: JSON.parse(readFileSync(memoryPath, 'utf8')),
  limitations: [
    'This proves local Compose orchestration and rollback mechanics, not compatibility between two historical release binaries.',
    'Synthetic elapsed stage time is advanced directly in the disposable database; every business start and completion transition still passes through the authenticated Processor API.',
    'The memory result is one steady-state snapshot, not a production capacity guarantee.',
    'No Pressly production, Cents, DNS configuration, or deployed cloud endpoint was intentionally contacted. Uncached image builds may contact configured package or container registries.',
  ],
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
NODE
REPORT_CREATED=true

echo '[v2] topology exercise completed; verifying teardown before publishing the proof report'
