#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${PRESSLY_APP_ROOT:-/opt/pressly}"
REPO_DIR="${PRESSLY_REPO_DIR:-$APP_ROOT/repo}"
ENV_FILE="${PRESSLY_ENV_FILE:-$APP_ROOT/.env.production}"
COMPOSE_FILE="${PRESSLY_COMPOSE_FILE:-$REPO_DIR/infra/aws/lightsail/docker-compose.production.yml}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_REF="${DEPLOY_REF:-${DEPLOY_BRANCH:-main}}"
API_HEALTH_URL="${PRESSLY_API_HEALTH_URL:-https://api.trypressly.com/health/ready}"
WEB_HEALTH_URL="${PRESSLY_WEB_HEALTH_URL:-https://trypressly.com/health}"
CURRENT_RELEASE_FILE="${PRESSLY_CURRENT_RELEASE_FILE:-$APP_ROOT/current-release}"
PREVIOUS_RELEASE_FILE="${PRESSLY_PREVIOUS_RELEASE_FILE:-$APP_ROOT/previous-release}"

export PRESSLY_ENV_FILE="$ENV_FILE"

case "$DEPLOY_BRANCH" in
  -* | *[!a-zA-Z0-9._/-]*)
    echo "Invalid deploy branch: $DEPLOY_BRANCH" >&2
    exit 1
    ;;
esac

case "$DEPLOY_REF" in
  -* | *[!a-zA-Z0-9._/-]*)
    echo "Invalid deploy ref: $DEPLOY_REF" >&2
    exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

if [[ "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then
  echo "Invalid env file permissions. Expected 600: $ENV_FILE" >&2
  exit 1
fi

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
if git show-ref --verify --quiet "refs/remotes/origin/$DEPLOY_REF"; then
  git checkout -B "$DEPLOY_REF" "origin/$DEPLOY_REF"
else
  git checkout --detach "$DEPLOY_REF"
fi

target_sha="$(git rev-parse --verify HEAD)"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  build

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  run --rm api pnpm -F @pressly/db migrate

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --remove-orphans --wait

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  ps

curl --fail --silent --show-error "$API_HEALTH_URL"
curl --fail --silent --show-error "$WEB_HEALTH_URL"

if [[ -n "$previous_sha" && "$previous_sha" != "$target_sha" ]]; then
  printf '%s\n' "$previous_sha" > "$PREVIOUS_RELEASE_FILE"
fi

printf '%s\n' "$target_sha" > "$CURRENT_RELEASE_FILE"
