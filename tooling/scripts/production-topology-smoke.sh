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
rotates two synthetic local four-image releases, and always tears the stack down.
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

wait_for_projection() {
  local deadline=$((SECONDS + 60))
  while ((SECONDS < deadline)); do
    local state
    state="$(database_scalar "
      select concat(
        coalesce((select status from webhook_events where source = 'cents' and subject_type = 'order' and subject_id = 'offline-smoke-order' limit 1), 'missing'),
        '|',
        coalesce((select po.status from production_orders po join order_demands demand on demand.id = po.order_demand_id where demand.demand_key = 'cents:order:offline-smoke-order' limit 1), 'missing'),
        '|',
        (select count(*) from production_orders po join order_demands demand on demand.id = po.order_demand_id where demand.demand_key = 'cents:order:offline-smoke-order')
      );
    ")"
    if [[ "$state" == 'processed|intake_pending|1' ]]; then
      return
    fi
    sleep 1
  done
  fail 'signed Cents event was not applied by Worker within 60 seconds.'
}

send_signed_webhook() {
  local body_file="$WORK_DIR/cents-order.json"
  local response_file="$WORK_DIR/cents-response.json"
  cat > "$body_file" <<'JSON'
{"action":"order_updated","order":{"id":"offline-smoke-order","storeId":"offline-smoke-store","status":"IN_PROGRESS","dueDate":"2030-01-15T20:00:00.000Z","updatedAt":"2030-01-15T14:00:00.000Z"},"services":[{"id":"offline-smoke-service","name":"Synthetic Wash and Fold","quantity":10,"totalPrice":"20.00","unitCost":"2.00","serviceCategory":"Wash and Fold","serviceCategoryType":"LAUNDRY"}]}
JSON
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
  node --input-type=module - "$response_file" <<'NODE'
import { readFileSync } from 'node:fs';
const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (response?.ok !== true || response?.data?.status !== 'pending' || response?.data?.duplicate !== false)
  throw new Error('Signed Cents webhook did not create one new pending event.');
NODE
}

echo '[v2] starting a clean Postgres volume and applying all migrations'
compose up -d --wait --wait-timeout 120 postgres
run_migrations
[[ "$(database_scalar 'select (select count(*) from webhook_events) + (select count(*) from production_orders);')" == 0 ]] ||
  fail 'clean migration unexpectedly contained runtime demand or production rows.'

echo '[v2] applying the explicit synthetic facility bootstrap fixture'
compose --profile tools run --rm --workdir /repo migrate \
  node apps/api/dist/commands/bootstrap-production.command.js \
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

INITIAL_HEARTBEAT="$(compose exec -T worker sh -c 'cat "${WORKER_HEARTBEAT_FILE:-/tmp/pressly-worker-heartbeat}"')"
[[ -n "$INITIAL_HEARTBEAT" ]] || fail 'Worker heartbeat file is empty.'

echo '[v2] sending one exact-byte signed Cents event through Caddy and waiting for Worker projection'
send_signed_webhook
wait_for_projection

echo '[v2] restarting API and Worker independently'
API_STARTED_BEFORE="$(docker inspect --format '{{.State.StartedAt}}' "$(compose ps -q api)")"
compose restart api >/dev/null
wait_for_health api
API_STARTED_AFTER="$(docker inspect --format '{{.State.StartedAt}}' "$(compose ps -q api)")"
[[ "$API_STARTED_AFTER" != "$API_STARTED_BEFORE" ]] || fail 'API restart did not change its start time.'
probe_ok api.pressly.test /health/ready
probe_ok processor.pressly.test /api/health/ready

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

promote_metadata "$RELEASE_A_SOURCE"

echo '[v2] migrating and switching all four applications to synthetic release-b'
set_release release-b
run_migrations
compose up -d --force-recreate --wait --wait-timeout 180 api web worker processor
assert_release_images release-b
probe_routes
wait_for_projection
promote_metadata "$RELEASE_B_SOURCE"
assert_metadata "$RELEASE_B_SOURCE" release-b "$RELEASE_A_SOURCE" release-a

echo '[v2] rolling all four applications back to release-a without invoking deploy.sh or Git'
set_release release-a
run_migrations
compose up -d --force-recreate --wait --wait-timeout 180 api web worker processor
assert_release_images release-a
probe_routes
wait_for_projection
swap_metadata_for_rollback
assert_metadata "$RELEASE_A_SOURCE" release-a "$RELEASE_B_SOURCE" release-b

RUNTIME_COUNTS="$(database_scalar "
  select concat(
    (select count(*) from webhook_events where source = 'cents' and subject_type = 'order' and subject_id = 'offline-smoke-order'),
    '|',
    (select count(*) from production_orders po join order_demands demand on demand.id = po.order_demand_id where demand.demand_key = 'cents:order:offline-smoke-order')
  );
")"
[[ "$RUNTIME_COUNTS" == '1|1' ]] || fail "rollback duplicated durable runtime state: $RUNTIME_COUNTS"

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
    routes: ['web:/health', 'api:/health/ready', 'processor:/', 'processor:/api/health/ready', 'processor:/api/processor/auth/session'],
  },
  database: {
    cleanMigration: true,
    explicitSyntheticBootstrap: true,
    signedReceiptCount: 1,
    projectedOrderCount: 1,
    projectionStatus: 'intake_pending',
  },
  recovery: {
    apiRestartHealthy: true,
    workerRestartHeartbeatAdvanced: true,
  },
  processorAuthentication: {
    loginThroughCaddy: true,
    secureHttpOnlyStrictHostCookie: true,
    sessionRestoredFromCookie: true,
    missingCsrfRejected: true,
    validCsrfLogoutAccepted: true,
    revokedSessionRejected: true,
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
  externalReconciliation: {
    supported: false,
    reason: 'No verified Cents updated-orders read API is available.',
  },
  limitations: [
    'This proves local Compose orchestration and rollback mechanics, not compatibility between two historical release binaries.',
    'The memory result is one steady-state snapshot, not a production capacity guarantee.',
    'No Pressly production, Cents, DNS configuration, or deployed cloud endpoint was intentionally contacted. Uncached image builds may contact configured package or container registries.',
  ],
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
NODE
REPORT_CREATED=true

echo '[v2] topology exercise completed; verifying teardown before publishing the proof report'
