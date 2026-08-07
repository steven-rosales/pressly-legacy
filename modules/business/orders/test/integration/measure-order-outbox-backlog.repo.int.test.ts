import { eq } from '@pressly/db/query';
import * as businessSchema from '@pressly/db/schema/business';
import * as schema from '@pressly/db/schema/orders';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresOrdersWorkerApplication } from '../../src/composition/orders.composition.ts';
import { createOrdersTestDatabase } from '../support/database.ts';

const testDb = createOrdersTestDatabase();
const now = new Date('2026-08-06T16:00:00.000Z');
const clock = { now: () => now };
const businessId = '00000000-0000-4000-8000-000000000361';
const locationId = 'orders-outbox-backlog-location';
const orderId = '00000000-0000-4000-8000-000000000362';
const fulfillmentId = '00000000-0000-4000-8000-000000000363';

const insertOrderOutboxFixtures = async (): Promise<void> => {
  await testDb.db.insert(schema.orders).values({
    id: orderId,
    businessId,
    customerResolution: 'not_provided',
    dueAt: new Date('2026-08-07T16:00:00.000Z'),
  });
  await testDb.db.insert(schema.orderFulfillments).values({
    id: fulfillmentId,
    businessId,
    orderId,
    typeCode: 'wash_fold',
    locationId,
  });
  await testDb.db.insert(schema.orderOutboxEvents).values([
    {
      id: '00000000-0000-4000-8000-000000000364',
      orderId,
      fulfillmentId,
      eventType: 'pending_fixture',
      aggregateVersion: 1,
      payload: {},
      status: 'pending',
      createdAt: new Date('2026-08-06T15:55:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000365',
      orderId,
      fulfillmentId,
      eventType: 'processing_fixture',
      aggregateVersion: 2,
      payload: {},
      status: 'processing',
      leaseOwner: 'worker-1',
      leaseExpiresAt: new Date('2026-08-06T16:01:00.000Z'),
      createdAt: new Date('2026-08-06T15:50:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000366',
      orderId,
      fulfillmentId,
      eventType: 'completed_fixture',
      aggregateVersion: 3,
      payload: {},
      status: 'completed',
      completedAt: new Date('2026-08-06T15:59:00.000Z'),
      createdAt: new Date('2026-08-06T15:00:00.000Z'),
    },
    {
      id: '00000000-0000-4000-8000-000000000367',
      orderId,
      fulfillmentId,
      eventType: 'dead_fixture',
      aggregateVersion: 4,
      payload: {},
      status: 'dead',
      deadAt: new Date('2026-08-06T15:59:00.000Z'),
      createdAt: new Date('2026-08-06T14:00:00.000Z'),
    },
  ]);
};

beforeAll(async () => {
  await testDb.check();
  await testDb.db
    .insert(businessSchema.businessAccounts)
    .values({
      id: businessId,
      slug: 'orders-outbox-backlog-fixture',
      displayName: 'Orders outbox backlog fixture',
    })
    .onConflictDoNothing();
  await testDb.db
    .insert(businessSchema.productionLocations)
    .values({
      id: locationId,
      businessId,
      name: 'Orders outbox backlog location',
      timezone: 'America/New_York',
    })
    .onConflictDoNothing();
});

beforeEach(testDb.reset);

afterAll(async () => {
  await testDb.reset();
  await testDb.db
    .delete(businessSchema.productionLocations)
    .where(eq(businessSchema.productionLocations.id, locationId));
  await testDb.db
    .delete(businessSchema.businessAccounts)
    .where(eq(businessSchema.businessAccounts.id, businessId));
  await testDb.close();
});

describe('Postgres Order outbox backlog measurement', () => {
  it('reports an empty backlog as zero', async () => {
    const orders = makePostgresOrdersWorkerApplication({
      db: testDb.db,
      clock,
    });

    await expect(orders.measureOutboxBacklog()).resolves.toEqual({
      pendingCount: 0,
      oldestPendingAgeSeconds: 0,
    });
  });

  it('counts pending and processing events while excluding terminal events', async () => {
    await insertOrderOutboxFixtures();
    const orders = makePostgresOrdersWorkerApplication({
      db: testDb.db,
      clock,
    });

    await expect(orders.measureOutboxBacklog()).resolves.toEqual({
      pendingCount: 2,
      oldestPendingAgeSeconds: 600,
    });
  });
});
