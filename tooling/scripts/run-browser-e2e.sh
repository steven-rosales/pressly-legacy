#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export PRESSLY_TOOLING_ERROR_FACTORY_PATH="$ROOT_DIR/platform/errors/src/tooling-error.mjs"
PRODUCTION_COMPOSE="$ROOT_DIR/deploy/aws/lightsail/docker-compose.production.yml"
SMOKE_FIXTURE_DIR="$ROOT_DIR/tooling/fixtures/production-topology"
SMOKE_COMPOSE="$SMOKE_FIXTURE_DIR/docker-compose.smoke.yml"
BROWSER_FIXTURE_DIR="$ROOT_DIR/tooling/browser-e2e/fixtures"
BROWSER_COMPOSE="$BROWSER_FIXTURE_DIR/docker-compose.browser.yml"

fail() {
  echo "browser e2e failed: $*" >&2
  exit 1
}

[[ -z "${DOCKER_HOST:-}" || "$DOCKER_HOST" == unix://* ]] ||
  fail 'refusing a non-local DOCKER_HOST override.'

for command_name in docker node pnpm curl; do
  command -v "$command_name" >/dev/null || fail "$command_name is required."
done

DOCKER_CONTEXT="$(docker context show)"
DOCKER_ENDPOINT="$(docker context inspect "$DOCKER_CONTEXT" --format '{{.Endpoints.docker.Host}}')"
[[ "$DOCKER_ENDPOINT" == unix://* ]] ||
  fail "refusing a non-local Docker endpoint: $DOCKER_ENDPOINT"

PROJECT_NAME="${PRESSLY_BROWSER_E2E_PROJECT:-pressly-browser-e2e-$(id -u)-$$}"
[[ "$PROJECT_NAME" =~ ^pressly-browser-e2e-[a-z0-9-]+$ ]] ||
  fail 'project name must start with pressly-browser-e2e- and contain only lowercase letters, digits, and hyphens.'

for resource in \
  "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")" \
  "$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")" \
  "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"; do
  [[ -z "$resource" ]] || fail "refusing to reuse Docker resources for $PROJECT_NAME."
done

for service in api web worker processor control; do
  image="$PROJECT_NAME-$service:browser"
  docker image inspect "$image" >/dev/null 2>&1 &&
    fail "refusing to overwrite the existing image $image."
done

if [[ -n "${PRESSLY_BROWSER_E2E_CADDY_PORT:-}" ]]; then
  CADDY_PORT="$PRESSLY_BROWSER_E2E_CADDY_PORT"
else
  CADDY_PORT="$(node --input-type=module <<'NODE'
import { createServer } from 'node:net';
const server = createServer();
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (typeof address === 'string' || address === null) process.exit(1);
  process.stdout.write(String(address.port));
  server.close();
});
NODE
)"
fi
[[ "$CADDY_PORT" =~ ^[0-9]+$ ]] || fail 'Caddy port must be numeric.'
((CADDY_PORT >= 1024 && CADDY_PORT <= 65535)) ||
  fail 'Caddy port must be between 1024 and 65535.'

RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pressly-browser-e2e.XXXXXX")"
[[ "$RUNTIME_DIR" == /tmp/pressly-browser-e2e.* ]] ||
  fail "unexpected runtime directory: $RUNTIME_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
ARTIFACT_DIR="${PRESSLY_BROWSER_E2E_ARTIFACT_DIR:-$ROOT_DIR/.artifacts/playwright/$RUN_ID}"
mkdir -p "$ARTIFACT_DIR"

random_base64url() {
  node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes($1).toString('base64url'));"
}

export PRESSLY_SMOKE_REPO_ROOT="$ROOT_DIR"
export PRESSLY_SMOKE_FIXTURE_DIR="$SMOKE_FIXTURE_DIR"
export PRESSLY_BROWSER_E2E_FIXTURE_DIR="$BROWSER_FIXTURE_DIR"
export PRESSLY_SMOKE_CADDY_PORT="$CADDY_PORT"
export PRESSLY_SMOKE_DATABASE_PASSWORD="$(random_base64url 24)"
export PRESSLY_SMOKE_AUTH_SECRET="$(random_base64url 48)"
export PRESSLY_SMOKE_MFA_ENCRYPTION_KEY="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64'));")"
export PRESSLY_SMOKE_CSRF_SECRET="$(random_base64url 48)"
export PRESSLY_SMOKE_CONTROL_CSRF_SECRET="$(random_base64url 48)"
export PRESSLY_SMOKE_CENTS_HMAC_KEY="$(random_base64url 48)"
export PRESSLY_SMOKE_CENTS_QUARANTINE_KEY="$(node --input-type=module -e "import { randomBytes } from 'node:crypto'; process.stdout.write(randomBytes(32).toString('base64'));")"
export PRESSLY_RELEASE_SHA="$(printf 'e%.0s' {1..40})"
export PRESSLY_API_IMAGE="$PROJECT_NAME-api:browser"
export PRESSLY_PROCESSOR_IMAGE="$PROJECT_NAME-processor:browser"
export PRESSLY_CONTROL_IMAGE="$PROJECT_NAME-control:browser"
export PRESSLY_WEB_IMAGE="$PROJECT_NAME-web:browser"
export PRESSLY_WORKER_IMAGE="$PROJECT_NAME-worker:browser"
export PRESSLY_BROWSER_E2E_RUNTIME_DIR="$RUNTIME_DIR"
export PRESSLY_BROWSER_E2E_ARTIFACT_DIR="$ARTIFACT_DIR"
export PRESSLY_BROWSER_E2E_WEB_ORIGIN="https://web.pressly.test:$CADDY_PORT"
export PRESSLY_BROWSER_E2E_API_ORIGIN="https://api.pressly.test:$CADDY_PORT"
export PRESSLY_BROWSER_E2E_CONTROL_ORIGIN="https://control.pressly.test:$CADDY_PORT"
export PRESSLY_BROWSER_E2E_PROCESSOR_ORIGIN="https://processor.pressly.test:$CADDY_PORT"
export PRESSLY_BROWSER_E2E_CREDENTIAL_FILE="$RUNTIME_DIR/owner.json"

OWNER_EMAIL="owner@browser-e2e.invalid"
OWNER_PASSWORD="$(random_base64url 24)Aa1!"
umask 077
node --input-type=module - "$PRESSLY_BROWSER_E2E_CREDENTIAL_FILE" "$OWNER_EMAIL" 3<<<"$OWNER_PASSWORD" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const [path, email] = process.argv.slice(2);
const password = readFileSync(3, 'utf8').replace(/\n$/u, '');
writeFileSync(path, `${JSON.stringify({ email, password })}\n`, { flag: 'wx', mode: 0o600 });
NODE

compose() {
  docker compose \
    --project-name "$PROJECT_NAME" \
    -f "$PRODUCTION_COMPOSE" \
    -f "$SMOKE_COMPOSE" \
    -f "$BROWSER_COMPOSE" \
    "$@"
}

database_scalar() {
  local sql="$1"
  compose exec -T postgres psql -v ON_ERROR_STOP=1 -U pressly -d pressly -Atc "$sql"
}

bootstrap_manifest_scalar() {
  local sql="$1"
  local manifest_json
  manifest_json="$(node --input-type=module - "$SMOKE_FIXTURE_DIR/production-bootstrap.json" <<'NODE'
import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(process.argv[2], 'utf8'));
process.stdout.write(JSON.stringify(manifest));
NODE
)"
  compose exec -T postgres psql \
    -v ON_ERROR_STOP=1 \
    -v "bootstrap_manifest=$manifest_json" \
    -U pressly \
    -d pressly \
    -At <<<"$sql"
}

cleanup() {
  local exit_code="$?"
  local cleanup_failed=false
  trap - EXIT INT TERM
  set +e

  if ((exit_code != 0)); then
    compose ps >"$ARTIFACT_DIR/compose-ps.txt" 2>&1
    compose logs --no-color --tail=250 caddy api web worker processor control postgres >"$ARTIFACT_DIR/services.log" 2>&1
  fi

  compose down --volumes --remove-orphans --timeout 10 >/dev/null 2>&1 || cleanup_failed=true
  for service in api web worker processor control; do
    docker image rm "$PROJECT_NAME-$service:browser" >/dev/null 2>&1 || cleanup_failed=true
  done

  project_containers="$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  project_networks="$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  project_volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT_NAME")"
  if [[ -n "$project_containers" || -n "$project_networks" || -n "$project_volumes" ]]; then
    echo "browser e2e cleanup left Docker resources for $PROJECT_NAME." >&2
    cleanup_failed=true
  fi

  [[ "$RUNTIME_DIR" == /tmp/pressly-browser-e2e.* ]] || cleanup_failed=true
  rm -rf -- "$RUNTIME_DIR" || cleanup_failed=true

  if [[ "$cleanup_failed" == true ]]; then
    echo 'browser e2e cleanup failed.' >&2
    exit_code=1
  fi
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[browser-e2e] project=$PROJECT_NAME docker_context=$DOCKER_CONTEXT endpoint=$DOCKER_ENDPOINT"
RENDERED_CONFIG="$RUNTIME_DIR/compose.json"
compose config --format json >"$RENDERED_CONFIG"
node --input-type=module - "$RENDERED_CONFIG" "$PROJECT_NAME" <<'NODE'
import { readFileSync } from 'node:fs';

const { toolingError } = await import(process.env.PRESSLY_TOOLING_ERROR_FACTORY_PATH);
const smokeFailure = (message) => toolingError({ code: 'browser_e2e_failure', message });
const [path, project] = process.argv.slice(2);
const config = JSON.parse(readFileSync(path, 'utf8'));
if (config.name !== project) throw smokeFailure(`unexpected Compose project: ${config.name}`);
const published = Object.entries(config.services).flatMap(([name, service]) =>
  (service.ports ?? []).map((port) => ({ name, port })),
);
if (published.length !== 1 || published[0].name !== 'caddy') {
  throw smokeFailure(`only Caddy may publish a port: ${JSON.stringify(published)}`);
}
if (published[0].port.host_ip !== '127.0.0.1' || published[0].port.target !== 443) {
  throw smokeFailure('Caddy must bind local HTTPS only on 127.0.0.1.');
}
const dependencies = Object.keys(config.services.caddy.depends_on ?? {}).sort();
if (JSON.stringify(dependencies) !== JSON.stringify(['api', 'control', 'processor', 'web'])) {
  throw smokeFailure(`unexpected browser ingress dependencies: ${JSON.stringify(dependencies)}`);
}
for (const service of ['api', 'web', 'worker', 'processor', 'control']) {
  if (config.services[service].read_only !== true) throw smokeFailure(`${service} must be read-only.`);
}
const browserControlMutationRateLimit =
  config.services.api.environment.API_CONTROL_MUTATION_RATE_LIMIT;
if (browserControlMutationRateLimit !== '120') {
  throw smokeFailure(
    `unexpected browser Control mutation rate limit: ${String(browserControlMutationRateLimit)}`,
  );
}
NODE

echo '[browser-e2e] building API, Web, Worker, Control, and Processor production images'
compose build api web worker processor control
compose up -d --wait --wait-timeout 120 postgres
compose --profile tools run --rm --workdir /repo migrate \
  node --import tsx tooling/postgres/migrate.ts
compose --profile tools run --rm --workdir /repo migrate \
  node --import tsx tooling/postgres/seed-pricing.ts
OWNER_BOOTSTRAP_JSON="$(printf '%s\n' "$OWNER_PASSWORD" | \
  compose --profile tools run --rm -T \
    --env PRESSLY_BOOTSTRAP_BUSINESS_ID=00000000-0000-4000-8000-000000000100 \
    --env PRESSLY_BOOTSTRAP_BUSINESS_SLUG=browser-e2e \
    --env PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME='Browser E2E' \
    --env "PRESSLY_BOOTSTRAP_OWNER_EMAIL=$OWNER_EMAIL" \
    --env PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner \
    --workdir /repo migrate \
    node hosts/cli/dist/main.js bootstrap owner \
    --password-stdin)"
OWNER_REPLAY_JSON="$(printf '%s\n' "$OWNER_PASSWORD" | \
  compose --profile tools run --rm -T \
    --env PRESSLY_BOOTSTRAP_BUSINESS_ID=00000000-0000-4000-8000-000000000100 \
    --env PRESSLY_BOOTSTRAP_BUSINESS_SLUG=browser-e2e \
    --env PRESSLY_BOOTSTRAP_BUSINESS_DISPLAY_NAME='Browser E2E' \
    --env "PRESSLY_BOOTSTRAP_OWNER_EMAIL=$OWNER_EMAIL" \
    --env PRESSLY_BOOTSTRAP_OWNER_CONFIRM=bootstrap-first-owner \
    --workdir /repo migrate \
    node hosts/cli/dist/main.js bootstrap owner \
    --password-stdin)"
OWNER_ID="$(node --input-type=module - "$OWNER_BOOTSTRAP_JSON" "$OWNER_REPLAY_JSON" <<'NODE'
const { toolingError } = await import(process.env.PRESSLY_TOOLING_ERROR_FACTORY_PATH);
const [createdSource, replayedSource] = process.argv.slice(2);
const created = JSON.parse(createdSource);
const replayed = JSON.parse(replayedSource);
if (created.replayed !== false || replayed.replayed !== true || replayed.identityId !== created.identityId)
  throw toolingError({ code: 'browser_e2e_failure', message: 'Owner bootstrap did not prove fresh creation followed by exact replay.' });
process.stdout.write(created.identityId);
NODE
)"
compose --profile tools run --rm --workdir /repo migrate \
  node hosts/cli/dist/main.js bootstrap production \
  --file /repo/tooling/fixtures/production-topology/production-bootstrap.json \
  --actor-id "$OWNER_ID" \
  --idempotency-key browser-e2e-bootstrap-v1 \
  --apply >/dev/null
[[ "$(bootstrap_manifest_scalar "with expected as (
  select :'bootstrap_manifest'::jsonb -> 'location' as location
)
select concat(
  (select count(*) from business_accounts where id = '00000000-0000-4000-8000-000000000100' and slug = 'browser-e2e' and status = 'active'),
  '|',
  (select count(*)
   from access_production_locations access_location
   cross join expected
   where access_location.id = expected.location ->> 'id'),
  '|',
  (select count(*)
   from access_production_locations access_location
   cross join expected
   where access_location.id = expected.location ->> 'id'
     and access_location.business_id = (expected.location ->> 'businessId')::uuid
     and access_location.name = expected.location ->> 'name'
     and access_location.timezone = expected.location ->> 'timezone'
     and access_location.is_active = (expected.location ->> 'isActive')::boolean),
  '|',
  (select count(*)
   from production_locations production_location
   cross join expected
   where production_location.id = expected.location ->> 'id'),
  '|',
  (select count(*)
   from production_locations production_location
   cross join expected
   where production_location.id = expected.location ->> 'id'
     and production_location.business_id = (expected.location ->> 'businessId')::uuid
     and production_location.name = expected.location ->> 'name'
     and production_location.timezone = expected.location ->> 'timezone'
     and production_location.is_active = (expected.location ->> 'isActive')::boolean)
);")" == '1|1|1|1|1' ]] ||
  fail 'owner and owner-local location rows do not exactly match the bootstrap manifest.'
unset OWNER_PASSWORD

compose up -d --wait --wait-timeout 180 api web worker processor control caddy
for endpoint in \
  "$PRESSLY_BROWSER_E2E_WEB_ORIGIN/health" \
  "$PRESSLY_BROWSER_E2E_API_ORIGIN/health/ready" \
  "$PRESSLY_BROWSER_E2E_CONTROL_ORIGIN/health" \
  "$PRESSLY_BROWSER_E2E_PROCESSOR_ORIGIN/health"; do
  host="$(node --input-type=module -e "process.stdout.write(new URL(process.argv[1]).hostname)" "$endpoint")"
  curl --fail --silent --show-error --insecure \
    --resolve "$host:$CADDY_PORT:127.0.0.1" "$endpoint" >/dev/null
done

playwright_args=("$@")
if [[ "${CI:-false}" == true ]]; then
  playwright_args+=(--fail-on-flaky-tests)
fi

echo '[browser-e2e] building host-side browser contract dependencies'
pnpm exec turbo build --filter=@pressly/topology... --concurrency=2

echo "[browser-e2e] running Chromium against disposable local HTTPS; artifacts=$ARTIFACT_DIR"
cd "$ROOT_DIR"
pnpm exec playwright test \
  --config tooling/browser-e2e/playwright.config.ts \
  "${playwright_args[@]}"
