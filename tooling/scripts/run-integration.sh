#!/usr/bin/env bash
set -euo pipefail

export PRESSLY_TEST_ADMIN_DATABASE_URL="${PRESSLY_TEST_ADMIN_DATABASE_URL:-postgres://pressly:pressly@localhost:55434/pressly_test}"
export PRESSLY_TEST_MIGRATION_DATABASE_URL="${PRESSLY_TEST_MIGRATION_DATABASE_URL:-postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_RUNTIME_DATABASE_URL="${PRESSLY_TEST_RUNTIME_DATABASE_URL:-postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_BACKUP_DATABASE_URL="${PRESSLY_TEST_BACKUP_DATABASE_URL:-postgres://pressly_backup:pressly_backup_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_DATABASE_URL="${PRESSLY_TEST_DATABASE_URL:-$PRESSLY_TEST_RUNTIME_DATABASE_URL}"
export PRESSLY_TEST_DATABASE_RESET_URL="${PRESSLY_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_MIGRATION_DATABASE_URL}"

tooling/scripts/configure-test-database-roles.sh
DATABASE_URL="$PRESSLY_TEST_MIGRATION_DATABASE_URL" pnpm -F @pressly/db migrate
pnpm -F @pressly/db test:integration
pnpm -F @pressly/users test:integration
pnpm -F @pressly/users test
pnpm -F @pressly/orders test:integration
pnpm -F @pressly/orders test
pnpm -F @pressly/webhook-ingestion test:integration
pnpm -F @pressly/webhook-ingestion test
pnpm -F @pressly/worker test
pnpm -F @pressly/production test:integration
pnpm -F @pressly/production test
pnpm exec vitest run tooling/test/cents-webhook-assets.test.mjs
