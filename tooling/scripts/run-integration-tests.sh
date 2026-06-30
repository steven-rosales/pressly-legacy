#!/usr/bin/env bash
set -euo pipefail

target="${1:-all}"

export PRESSLY_TEST_ADMIN_DATABASE_URL="${PRESSLY_TEST_ADMIN_DATABASE_URL:-postgres://pressly:pressly@localhost:55434/pressly_test}"
export PRESSLY_TEST_MIGRATION_DATABASE_URL="${PRESSLY_TEST_MIGRATION_DATABASE_URL:-postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_RUNTIME_DATABASE_URL="${PRESSLY_TEST_RUNTIME_DATABASE_URL:-postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_BACKUP_DATABASE_URL="${PRESSLY_TEST_BACKUP_DATABASE_URL:-postgres://pressly_backup:pressly_backup_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_DATABASE_URL="${PRESSLY_TEST_DATABASE_URL:-$PRESSLY_TEST_RUNTIME_DATABASE_URL}"
export PRESSLY_TEST_DATABASE_RESET_URL="${PRESSLY_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_MIGRATION_DATABASE_URL}"

tooling/scripts/configure-test-database-roles.sh
DATABASE_URL="$PRESSLY_TEST_MIGRATION_DATABASE_URL" pnpm -F @pressly/db migrate

case "$target" in
  all)
    pnpm -F @pressly/db test:integration
    pnpm -F @pressly/auth-module test:integration
    pnpm -F @pressly/pricing test:integration
    ;;
  auth)
    pnpm -F @pressly/auth-module test:integration
    ;;
  pricing)
    pnpm -F @pressly/pricing test:integration
    ;;
  db-security)
    pnpm -F @pressly/db test:integration
    ;;
  *)
    echo "Unknown integration test target: $target" >&2
    exit 1
    ;;
esac
