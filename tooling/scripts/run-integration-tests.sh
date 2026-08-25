#!/usr/bin/env bash
set -euo pipefail

target="${1:-all}"

export VITEST_MAX_WORKERS="${VITEST_MAX_WORKERS:-1}"
export PRESSLY_TEST_ADMIN_DATABASE_URL="${PRESSLY_TEST_ADMIN_DATABASE_URL:-postgres://pressly:pressly@localhost:55434/pressly_test}"
export PRESSLY_TEST_MIGRATION_DATABASE_URL="${PRESSLY_TEST_MIGRATION_DATABASE_URL:-postgres://pressly_migration:pressly_migration_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_RUNTIME_DATABASE_URL="${PRESSLY_TEST_RUNTIME_DATABASE_URL:-postgres://pressly_runtime:pressly_runtime_test@localhost:55434/pressly_test}"
export PRESSLY_TEST_BACKUP_DATABASE_URL="${PRESSLY_TEST_BACKUP_DATABASE_URL:-postgres://pressly_backup:pressly_backup_test@localhost:55434/pressly_test}"
export PRESSLY_POSTGRES_LEDGER_ADMIN_DATABASE_URL="${PRESSLY_POSTGRES_LEDGER_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_TEST_DATABASE_URL="${PRESSLY_TEST_DATABASE_URL:-$PRESSLY_TEST_RUNTIME_DATABASE_URL}"
export PRESSLY_TEST_DATABASE_RESET_URL="${PRESSLY_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_MIGRATION_DATABASE_URL}"
export PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_URL="${PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_RESET_URL="${PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_CUSTOMERS_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_CUSTOMERS_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ACCESS_NATIVE_ADMIN_DATABASE_URL="${PRESSLY_ACCESS_NATIVE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ACCESS_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_ACCESS_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ORDERS_INTAKE_CELL_TEST_DATABASE_URL="${PRESSLY_ORDERS_INTAKE_CELL_TEST_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_ORDERS_INTAKE_CELL_TEST_DATABASE_RESET_URL="${PRESSLY_ORDERS_INTAKE_CELL_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_ORDERS_SYSTEM_TEST_DATABASE_URL="${PRESSLY_ORDERS_SYSTEM_TEST_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_ORDERS_SYSTEM_TEST_DATABASE_RESET_URL="${PRESSLY_ORDERS_SYSTEM_TEST_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_ORDERS_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_ORDERS_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ORDERS_CAPABILITIES_ADMIN_DATABASE_URL="${PRESSLY_ORDERS_CAPABILITIES_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ORDERS_NATIVE_ADMIN_DATABASE_URL="${PRESSLY_ORDERS_NATIVE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_PRICING_SYSTEM_TEST_ADMIN_DATABASE_URL="${PRESSLY_PRICING_SYSTEM_TEST_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_PRICING_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_PRICING_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_INGRESS_CONFORMANCE_DATABASE_URL="${PRESSLY_INGRESS_CONFORMANCE_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_INGRESS_CONFORMANCE_DATABASE_RESET_URL="${PRESSLY_INGRESS_CONFORMANCE_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_URL="${PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_RESET_URL="${PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_ORDERS_INTAKE_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_ORDERS_INTAKE_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_URL="${PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_URL:-$PRESSLY_TEST_DATABASE_URL}"
export PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_RESET_URL="${PRESSLY_APPLY_FULFILLMENT_DEMAND_CONFORMANCE_DATABASE_RESET_URL:-$PRESSLY_TEST_DATABASE_RESET_URL}"
export PRESSLY_SOURCE_CLOSED_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_SOURCE_CLOSED_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ATTEMPT_PLACEMENT_ADMIN_DATABASE_URL="${PRESSLY_ATTEMPT_PLACEMENT_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_WEBHOOK_FLOW_ADMIN_DATABASE_URL="${PRESSLY_WEBHOOK_FLOW_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ORDER_OUTBOX_FLOW_ADMIN_DATABASE_URL="${PRESSLY_ORDER_OUTBOX_FLOW_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_ACCEPT_SCHEDULE_ADMIN_DATABASE_URL="${PRESSLY_ACCEPT_SCHEDULE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_CREATE_SCHEDULE_ADMIN_DATABASE_URL="${PRESSLY_CREATE_SCHEDULE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_PLACEMENT_CONFORMANCE_ADMIN_DATABASE_URL="${PRESSLY_PLACEMENT_CONFORMANCE_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_PUBLISH_SCHEDULER_CONFIG_DATABASE_URL="${PRESSLY_PUBLISH_SCHEDULER_CONFIG_DATABASE_URL:-$PRESSLY_TEST_MIGRATION_DATABASE_URL}"
export PRESSLY_REPLACE_SHIFT_SELECTION_ADMIN_DATABASE_URL="${PRESSLY_REPLACE_SHIFT_SELECTION_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"
export PRESSLY_UPDATE_SHIFT_ADMIN_DATABASE_URL="${PRESSLY_UPDATE_SHIFT_ADMIN_DATABASE_URL:-$PRESSLY_TEST_ADMIN_DATABASE_URL}"

# These suites invoke Vitest directly, so materialize the compiled workspace
# exports loaded by the API-composed integration graph first.
pnpm build:integration-deps

tooling/scripts/configure-test-database-roles.sh
DATABASE_URL="$PRESSLY_TEST_MIGRATION_DATABASE_URL" pnpm db:migrate

case "$target" in
  systems)
    pnpm -F @pressly/access-system test:postgres
    pnpm -F @pressly/customers-system test:postgres
    pnpm -F @pressly/orders-system test:postgres
    pnpm -F @pressly/pricing-system test:postgres
    pnpm -F @pressly/ingress-system test:postgres
    pnpm -F @pressly/production-system test:postgres
    ;;
  all)
    pnpm -F @pressly/postgres test:postgres
    pnpm -F @pressly/migrations-verification test:postgres
    pnpm -F @pressly/access-system test:postgres
    pnpm -F @pressly/access-verification test:postgres
    pnpm -F @pressly/customers-system test:postgres
    pnpm -F @pressly/customers-verification test:postgres
    pnpm -F @pressly/orders-system test:postgres
    pnpm -F @pressly/orders-verification test:postgres
    pnpm -F @pressly/pricing-system test:postgres
    pnpm -F @pressly/pricing-verification test:postgres
    pnpm -F @pressly/ingress-system test:postgres
    pnpm -F @pressly/ingress-verification test:postgres
    pnpm -F @pressly/orders-outbox-verification test:postgres
    pnpm -F @pressly/production-system test:postgres
    pnpm -F @pressly/command-verification test:postgres
    pnpm -F @pressly/query-verification test:postgres
    pnpm -F @pressly/scheduling-verification test:postgres
    pnpm -F @pressly/flow-verification test:postgres
    ;;
  conformance)
    pnpm -F @pressly/access-verification test:postgres
    pnpm -F @pressly/customers-verification test:postgres
    pnpm -F @pressly/orders-verification test:postgres
    pnpm -F @pressly/pricing-verification test:postgres
    pnpm -F @pressly/ingress-verification test:postgres
    pnpm -F @pressly/orders-outbox-verification test:postgres
    pnpm -F @pressly/command-verification test:postgres
    pnpm -F @pressly/query-verification test:postgres
    pnpm -F @pressly/scheduling-verification test:postgres
    pnpm -F @pressly/flow-verification test:postgres
    ;;
  lpms)
    pnpm -F @pressly/migrations-verification test:postgres
    pnpm -F @pressly/customers-system test
    pnpm -F @pressly/customers-system test:postgres
    pnpm -F @pressly/customers-verification test:postgres
    pnpm -F @pressly/orders-system test
    pnpm -F @pressly/orders-system test:postgres
    pnpm -F @pressly/orders-verification test:postgres
    pnpm -F @pressly/ingress-system test
    pnpm -F @pressly/ingress-system test:postgres
    pnpm -F @pressly/ingress-verification test:postgres
    pnpm -F @pressly/orders-outbox-verification test:postgres
    pnpm -F @pressly/jobs-host test
    pnpm -F @pressly/jobs-verification test
    pnpm -F @pressly/production-system test
    pnpm -F @pressly/production-system test:postgres
    pnpm -F @pressly/command-verification test:postgres
    pnpm -F @pressly/query-verification test:postgres
    pnpm -F @pressly/scheduling-verification test:postgres
    pnpm -F @pressly/flow-verification test:postgres
    pnpm exec vitest run tooling/test/cents-webhook-assets.test.mjs
    ;;
  auth)
    pnpm -F @pressly/access-system test:postgres
    pnpm -F @pressly/access-verification test:postgres
    ;;
  pricing)
    pnpm -F @pressly/pricing-system test
    pnpm -F @pressly/pricing-system test:postgres
    pnpm -F @pressly/pricing-verification test:postgres
    ;;
  production)
    pnpm -F @pressly/production-system test:postgres
    ;;
  db-security)
    pnpm -F @pressly/postgres test:postgres
    pnpm -F @pressly/migrations-verification test:postgres
    ;;
  *)
    echo "Unknown integration test target: $target" >&2
    exit 1
    ;;
esac
