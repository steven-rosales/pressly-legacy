import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import { type Database } from '@pressly/db/client';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import * as orderSchema from '@pressly/db/schema/orders';
import { createHash } from 'node:crypto';

export const productionTestBusinessId = '00000000-0000-4000-8000-000000000100';

const productionTables = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_bags',
  'production_orders',
  'production_shifts',
  'order_demands',
  'order_outbox_events',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_links',
  'order_items',
  'order_fulfillments',
  'orders',
  'webhook_events',
  'source_location_bindings',
  'production_locations',
] as const;

export const createProductionTestDatabase = (): TestDatabaseRuntime =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_test',
    ),
    tableNames: productionTables,
    maxConnections: 4,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });

export const seedCanonicalFulfillment = async (
  db: Database,
  input: Readonly<{
    orderId: string;
    fulfillmentId: string;
    businessId?: string;
    locationId: string;
    displayNumber: string | null;
    dueAt: string;
    releaseState?: 'unreleased' | 'released' | 'withdrawn';
    estimatedWeightLbs?: number | null;
    estimatedWeightSource?: string | null;
    bagCount?: number | null;
    version?: number;
  }>,
): Promise<void> => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const businessId = input.businessId ?? productionTestBusinessId;
  const version = input.version ?? 1;
  const estimatedWeightLbs =
    input.estimatedWeightLbs === undefined ? 1 : input.estimatedWeightLbs;
  const estimatedWeightSource =
    input.estimatedWeightSource === undefined
      ? estimatedWeightLbs === null
        ? null
        : 'test_estimate'
      : input.estimatedWeightSource;
  await db.insert(orderSchema.orders).values({
    id: input.orderId,
    businessId,
    customerUserId: null,
    customerResolution: 'not_provided',
    displayNumber: input.displayNumber,
    state: 'open',
    dueAt: new Date(input.dueAt),
    currency: 'USD',
    totalAmountCents: 0,
    balanceDueCents: null,
    version,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(orderSchema.orderFulfillments).values({
    id: input.fulfillmentId,
    businessId,
    orderId: input.orderId,
    typeCode: 'wash_fold',
    locationId: input.locationId,
    releaseState: input.releaseState ?? 'released',
    estimatedWeightLbs,
    estimatedWeightSource,
    bagCount: input.bagCount ?? null,
    version,
    createdAt: now,
    updatedAt: now,
  });
};

export type ProductionDemandSeed = Readonly<{
  id: string;
  demandKey: string;
  displayReference: string;
  locationId: string;
  revisionHash: string;
  revisionAt: Date;
  phase:
    | 'expected'
    | 'inbound'
    | 'production_released'
    | 'post_production'
    | 'withdrawn';
  commercialState?: 'open' | 'completed' | 'canceled';
  estimatedWeightLbs?: number | null;
  estimatedWeightSource?: string | null;
  dueAt: Date;
}>;

export const seedProductionDemands = async (
  db: Database,
  input: ProductionDemandSeed | readonly ProductionDemandSeed[],
): Promise<void> => {
  const demands = Array.isArray(input) ? input : [input];
  for (const demand of demands) {
    const releaseState =
      demand.phase === 'withdrawn'
        ? 'withdrawn'
        : demand.phase === 'production_released' ||
            demand.phase === 'post_production'
          ? 'released'
          : 'unreleased';
    await seedCanonicalFulfillment(db, {
      orderId: demand.id,
      fulfillmentId: demand.id,
      locationId: demand.locationId,
      displayNumber: demand.displayReference,
      dueAt: demand.dueAt.toISOString(),
      releaseState,
      estimatedWeightLbs: demand.estimatedWeightLbs ?? null,
      estimatedWeightSource: demand.estimatedWeightSource ?? null,
    });
    await db.insert(laundryProduction.orderDemands).values({
      ...demand,
      fulfillmentId: demand.id,
      fulfillmentVersion: 1,
      projectionHash: /^[a-f0-9]{64}$/.test(demand.revisionHash)
        ? demand.revisionHash
        : createHash('sha256').update(demand.revisionHash).digest('hex'),
      admissionState: releaseState,
      commercialState: demand.commercialState ?? 'open',
    });
  }
};
