#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_DIR="${PRESSLY_ENV_DIR:-$APP_ROOT/env}"
COMPOSE_ENV_FILE="${PRESSLY_COMPOSE_ENV_FILE:-$ENV_DIR/compose.env}"
CADDY_ENV_FILE="${PRESSLY_CADDY_ENV_FILE:-$ENV_DIR/caddy.env}"
WEB_ENV_FILE="${PRESSLY_WEB_ENV_FILE:-$ENV_DIR/web.env}"
API_ENV_FILE="${PRESSLY_API_ENV_FILE:-$ENV_DIR/api.env}"
POSTGRES_ENV_FILE="${PRESSLY_POSTGRES_ENV_FILE:-$ENV_DIR/postgres.env}"
MIGRATION_ENV_FILE="${PRESSLY_MIGRATION_ENV_FILE:-$ENV_DIR/migration.env}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
DEPLOY_SHA="${DEPLOY_SHA:-}"
API_HEALTH_URL="${PRESSLY_API_HEALTH_URL:-https://api.trypressly.com/health/ready}"
WEB_HEALTH_URL="${PRESSLY_WEB_HEALTH_URL:-https://trypressly.com/health}"
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"
CURRENT_RELEASE_METADATA_FILE="${PRESSLY_CURRENT_RELEASE_METADATA_FILE:-$APP_ROOT/current-release.json}"
PREVIOUS_RELEASE_METADATA_FILE="${PRESSLY_PREVIOUS_RELEASE_METADATA_FILE:-$APP_ROOT/previous-release.json}"
PRESSLY_API_IMAGE="${PRESSLY_API_IMAGE:-}"
PRESSLY_WEB_IMAGE="${PRESSLY_WEB_IMAGE:-}"
deployment_completed=false

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

on_exit() {
  local exit_code="$?"

  if [[ "$deployment_completed" != true && "$exit_code" -ne 0 ]]; then
    emit_deployment_event "failed" "$exit_code" >&2
  fi
}

trap on_exit EXIT

export PRESSLY_CADDY_ENV_FILE="$CADDY_ENV_FILE"
export PRESSLY_WEB_ENV_FILE="$WEB_ENV_FILE"
export PRESSLY_API_ENV_FILE="$API_ENV_FILE"
export PRESSLY_POSTGRES_ENV_FILE="$POSTGRES_ENV_FILE"
export PRESSLY_MIGRATION_ENV_FILE="$MIGRATION_ENV_FILE"
export PRESSLY_API_IMAGE
export PRESSLY_WEB_IMAGE

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

for env_file in \
  "$COMPOSE_ENV_FILE" \
  "$CADDY_ENV_FILE" \
  "$WEB_ENV_FILE" \
  "$API_ENV_FILE" \
  "$POSTGRES_ENV_FILE" \
  "$MIGRATION_ENV_FILE"; do
  if [[ ! -f "$env_file" ]]; then
    echo "Missing env file: $env_file" >&2
    exit 1
  fi

  if [[ "$(stat -c '%a' "$env_file")" != "600" ]]; then
    echo "Invalid env file permissions. Expected 600: $env_file" >&2
    exit 1
  fi
done

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing compose file: $COMPOSE_FILE" >&2
  exit 1
fi

previous_sha=""

if [[ -f "$CURRENT_RELEASE_FILE" ]]; then
  previous_sha="$(cat "$CURRENT_RELEASE_FILE")"
fi

cd "$REPO_DIR"

git fetch --prune origin '+refs/heads/*:refs/remotes/origin/*' '+refs/tags/*:refs/tags/*'
git cat-file -e "$DEPLOY_SHA^{commit}"
git checkout --detach "$DEPLOY_SHA"

target_sha="$(git rev-parse --verify HEAD)"
if [[ "$target_sha" != "${DEPLOY_SHA,,}" ]]; then
  echo "Resolved commit $target_sha does not match requested commit $DEPLOY_SHA." >&2
  exit 1
fi

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  pull

docker compose \
  --profile tools \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm --workdir /repo/packages/db migrate \
  node node_modules/drizzle-kit/bin.cjs migrate --config drizzle.config.ts

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans --wait

docker compose \
  --env-file "$COMPOSE_ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps

curl --fail --silent --show-error "$API_HEALTH_URL"
curl --fail --silent --show-error "$WEB_HEALTH_URL"

if [[ -n "$previous_sha" && "$previous_sha" != "$target_sha" ]]; then
  printf '%s\n' "$previous_sha" > "$PREVIOUS_RELEASE_FILE"
  if [[ -f "$CURRENT_RELEASE_METADATA_FILE" ]]; then
    cp "$CURRENT_RELEASE_METADATA_FILE" "$PREVIOUS_RELEASE_METADATA_FILE"
  fi
fi

printf '%s\n' "$target_sha" > "$CURRENT_RELEASE_FILE"
deployed_at="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"
printf '{"sourceSha":"%s","apiImage":"%s","webImage":"%s","deployedAt":"%s"}\n' \
  "$target_sha" \
  "$PRESSLY_API_IMAGE" \
  "$PRESSLY_WEB_IMAGE" \
  "$deployed_at" > "$CURRENT_RELEASE_METADATA_FILE"

echo "Deployed source SHA: $target_sha"
echo "API image: $PRESSLY_API_IMAGE"
echo "Web image: $PRESSLY_WEB_IMAGE"
echo "Deployment time: $deployed_at"
deployment_completed=true
emit_deployment_event "succeeded" 0
