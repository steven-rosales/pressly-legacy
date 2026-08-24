import { seedProductionLocationTestFacts } from '../testing/production-schema.spec-support.ts';
import { productionTestSchema } from '../testing/production-schema.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { makeListRecentProductionOrderActivityV1Capability } from './list-recent-order-activity-v1.postgres.ts';
import { makeResolveProductionFulfillmentReferencesV1Capability } from './resolve-fulfillment-references-v1.postgres.ts';

const id = (suffix: number): string =>
  `99000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const ids = {
  business: id(1),
  order: id(2),
  fulfillment: id(3),
  demand: id(4),
  productionOrder: id(5),
} as const;
const locationId = 'production-capability-location';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'production_orders',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(async () => {
  await database.reset();
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Capability Floor',
      timezone: 'America/New_York',
    },
  ]);
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'ORD-CAPABILITY',
    locationId,
    revisionAt: new Date('2026-08-22T12:00:00.000Z'),
    phase: 'production_released',
    estimatedWeightLbs: 12,
    estimatedWeightSource: 'source',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId,
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    derivedWeightLbs: 12,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: new Date('2026-08-22T12:01:00.000Z'),
    intakeVersion: 1,
  });
});
afterAll(database.close);

describe('Production operational-order public reads', () => {
  it('resolves fulfillment identity from Production order or demand identity', async () => {
    const capability = makeResolveProductionFulfillmentReferencesV1Capability({
      database: database.db,
      schema: productionTestSchema,
    });
    const resolved = await capability.resolve([
      {
        referenceId: 'by-production-order',
        productionOrderId: ids.productionOrder,
        orderDemandId: null,
      },
      {
        referenceId: 'by-demand',
        productionOrderId: null,
        orderDemandId: ids.demand,
      },
      {
        referenceId: 'missing',
        productionOrderId: id(90),
        orderDemandId: id(91),
      },
    ]);

    expect(resolved).toEqual(
      new Map([
        ['by-production-order', { fulfillmentId: ids.fulfillment }],
        ['by-demand', { fulfillmentId: ids.fulfillment }],
        ['missing', null],
      ]),
    );
  });

  it('returns only the newest eight Production order events', async () => {
    await database.db.insert(productionTestSchema.workEvents).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: id(100 + index),
        locationId,
        eventType: `production_event_${index}`,
        entityType: 'production_order',
        entityId: ids.productionOrder,
        actorId: id(200 + index),
        idempotencyKey: `production-capability-event-${index}`,
        payload: {},
        createdAt: new Date(
          Date.parse('2026-08-22T12:00:00.000Z') + index * 60_000,
        ),
      })),
    );
    const capability = makeListRecentProductionOrderActivityV1Capability({
      database: database.db,
      schema: productionTestSchema,
    });

    const activity = await capability.list({
      productionOrderIds: [ids.productionOrder],
    });

    expect(activity).toHaveLength(8);
    expect(activity.map((entry) => entry.code)).toEqual([
      'production_event_9',
      'production_event_8',
      'production_event_7',
      'production_event_6',
      'production_event_5',
      'production_event_4',
      'production_event_3',
      'production_event_2',
    ]);
  });
});
