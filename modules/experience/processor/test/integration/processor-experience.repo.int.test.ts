import * as business from '@pressly/db/schema/business';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import * as orders from '@pressly/db/schema/orders';
import * as users from '@pressly/db/schema/users';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresProcessorExperience } from '../../src/composition/processor.composition.ts';

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const hash = (value: number): string => value.toString(16).padStart(64, '0');
const now = new Date('2026-08-03T16:00:00.000Z');

const testDb = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'work_events',
    'production_orders',
    'order_demands',
    'production_locations',
    'order_command_receipts',
    'order_source_snapshots',
    'order_source_links',
    'order_fulfillments',
    'orders',
    'users',
  ],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: getTestDatabaseUrl(
          'PRESSLY_TEST_DATABASE_RESET_URL',
          'postgres://pressly:pressly@localhost:55434/pressly_test',
        ),
      }),
});

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('Postgres Processor experience', () => {
  it('loads canonical identity, source provenance, and cross-domain audit in batches', async () => {
    const businessId = uuid(1);
    const customerId = uuid(2);
    const orderId = uuid(3);
    const fulfillmentId = uuid(4);
    const demandId = uuid(5);
    const productionOrderId = uuid(6);
    const sourceLinkId = uuid(7);

    await testDb.db
      .insert(business.businessAccounts)
      .values({
        id: businessId,
        slug: 'processor-experience-test',
        displayName: 'Processor Experience Test',
      })
      .onConflictDoNothing();
    await testDb.db.insert(business.productionLocations).values({
      id: 'east',
      businessId,
      name: 'East',
      timezone: 'America/New_York',
    });
    await testDb.db.insert(users.users).values({
      id: customerId,
      businessId,
      version: 1,
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: '+12025550123',
    });
    await testDb.db.insert(orders.orders).values({
      id: orderId,
      businessId,
      customerUserId: customerId,
      customerResolution: 'resolved',
      displayNumber: 'ORDER-1',
      state: 'open',
      dueAt: new Date('2026-08-03T20:00:00.000Z'),
      version: 2,
    });
    await testDb.db.insert(orders.orderFulfillments).values({
      id: fulfillmentId,
      businessId,
      orderId,
      typeCode: 'wash_fold',
      locationId: 'east',
      releaseState: 'released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'source_estimate',
      version: 3,
    });
    await testDb.db.insert(laundryProduction.orderDemands).values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 3,
      projectionHash: hash(1),
      admissionState: 'released',
      commercialState: 'open',
      demandKey: `fulfillment:${fulfillmentId}`,
      displayReference: 'ORDER-1',
      locationId: 'east',
      revisionHash: hash(2),
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'source_estimate',
      dueAt: new Date('2026-08-03T20:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: productionOrderId,
      orderDemandId: demandId,
      locationId: 'east',
      dueAt: new Date('2026-08-03T20:00:00.000Z'),
      derivedWeightLbs: 20,
      derivedWeightSource: 'external_estimate',
      version: 4,
    });
    await testDb.db.insert(orders.orderSourceLinks).values({
      id: sourceLinkId,
      source: 'cents',
      externalOrderId: '1001',
      orderId,
    });
    await testDb.db.insert(orders.orderSourceSnapshots).values({
      sourceLinkId,
      sourceRevisionAt: new Date('2026-08-03T14:00:00.000Z'),
      sourceRevisionHash: hash(3),
      adapterVersion: 'cents-webhook-v2',
      sourceLifecycleCode: 'SUBMITTED',
      normalizedPayload: { id: 1001 },
      observedAt: new Date('2026-08-03T14:01:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.workEvents).values({
      id: uuid(8),
      locationId: 'east',
      eventType: 'production_order_intake_recorded',
      entityType: 'production_order',
      entityId: productionOrderId,
      actorId: uuid(9),
      idempotencyKey: 'processor-experience-integration-1',
      payload: {},
      createdAt: new Date('2026-08-03T15:00:00.000Z'),
    });

    const experience = makePostgresProcessorExperience({
      db: testDb.db,
      clock: { now: () => now },
      origins: {
        processor: 'https://processor.trypressly.com',
        control: 'https://control.trypressly.com',
      },
      productionCapabilities: { resolveForLocation: () => [] },
    });

    const contexts = await experience.loadOperationalOrderControlContexts([
      {
        order: {
          id: productionOrderId,
          externalOrderId: fulfillmentId,
        },
      },
    ]);

    expect(contexts.get(productionOrderId)).toMatchObject({
      identity: {
        displayNumber: 'ORDER-1',
        customerDisplayName: 'Ada Lovelace',
      },
      canonical: {
        canonicalOrderId: orderId,
        canonicalFulfillmentId: fulfillmentId,
        source: { name: 'cents' },
        audit: expect.arrayContaining([
          expect.objectContaining({
            kind: 'production_command',
            code: 'production_order_intake_recorded',
          }),
          expect.objectContaining({
            kind: 'source_observation',
            actor: 'cents',
          }),
        ]),
      },
    });
  });
});
