import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';

const orderTables = [
  'production_order_stage_attempts',
  'production_batch_orders',
  'production_orders',
  'order_demands',
  'order_outbox_events',
  'order_command_receipts',
  'order_field_authorities',
  'order_source_observation_decisions',
  'order_source_control_revisions',
  'order_source_capability_profiles',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_proposal_resolutions',
  'order_source_proposals',
  'order_source_links',
  'order_items',
  'order_fulfillments',
  'orders',
  'user_command_receipts',
  'user_consents',
  'user_duplicate_candidates',
  'user_field_authorities',
  'user_source_snapshots',
  'user_source_links',
  'users',
] as const;

export const createOrdersTestDatabase = (): TestDatabaseRuntime =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_test',
    ),
    tableNames: orderTables,
    maxConnections: 4,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });
