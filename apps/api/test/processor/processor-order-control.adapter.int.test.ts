import * as business from '@pressly/db/schema/business';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import * as orders from '@pressly/db/schema/orders';
import * as users from '@pressly/db/schema/users';
import { makePostgresProcessorExperience } from '@pressly/processor-experience';
import type { ListProductionOrderControlResult } from '@pressly/production';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeProcessorOrderControlAdapter } from '../../src/http/processor/order-control/order-control.adapter.ts';

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
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: getTestDatabaseUrl(
          'PRESSLY_TEST_DATABASE_RESET_URL',
          'postgres://pressly:pressly@localhost:55434/pressly_test',
        ),
      }),
});
const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;
const hash = (value: number): string => value.toString(16).padStart(64, '0');
const businessId = '00000000-0000-4000-8000-000000000100';
const sameTime = new Date('2026-07-28T18:00:00.000Z');

const makeBaseItem = (
  productionOrderId: string,
  fulfillmentId: string,
  version: number,
): ListProductionOrderControlResult['items'][number] => ({
  order: {
    id: productionOrderId,
    locationId: 'east',
    externalOrderId: fulfillmentId,
    dueAt: new Date('2026-07-29T20:00:00.000Z'),
    dueBucket: 'tomorrow',
    priority: false,
    status: 'release_pending',
    derivedWeightLbs: 20,
    bagCount: null,
    bagCountProvenance: null,
    intakeVersion: null,
    version,
  },
  admission: {
    sourceState: 'unreleased',
    override: null,
    effectiveState: 'unreleased',
    allowedActions: ['release'],
  },
  attention: null,
  currentPlacement: null,
  nextRequiredStage: null,
  routeAttempts: [],
  commands: {
    queuedMove: {
      status: 'blocked',
      code: 'PRODUCTION_ORDER_ROUTE_NOT_FOUND',
      targets: [],
    },
    routeException: {
      status: 'blocked',
      code: 'PRODUCTION_ORDER_ROUTE_NOT_FOUND',
    },
  },
  resolutionAction: {
    status: 'allowed',
    expectedVersion: version,
    requiresExplicitReview: false,
    reviewReasons: [],
  },
});

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('Postgres Processor Order control composition', () => {
  it('bounds generic audit streams and returns source-name provenance without authority policy', async () => {
    const customerId = uuid(1);
    const orderIds = [uuid(101), uuid(102), uuid(103)] as const;
    const fulfillmentIds = [uuid(201), uuid(202), uuid(203)] as const;
    const demandIds = [uuid(301), uuid(302), uuid(303)] as const;
    const productionOrderIds = [uuid(401), uuid(402), uuid(403)] as const;
    const sourceLinkId = uuid(501);

    await testDb.db
      .insert(business.businessAccounts)
      .values({
        id: businessId,
        slug: 'pressly-one',
        displayName: 'Pressly One',
      })
      .onConflictDoNothing();
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'east',
      businessId,
      name: 'East',
      timezone: 'America/New_York',
    });
    await testDb.db.insert(users.users).values({
      id: customerId,
      businessId,
      version: 4,
      firstName: 'Santiago',
      lastName: 'Jackson',
      phone: '+18622917798',
    });
    await testDb.db.insert(orders.orders).values(
      orderIds.map((orderId, index) => ({
        id: orderId,
        businessId,
        customerUserId: customerId,
        customerResolution: 'resolved',
        displayNumber: `ORDER-${index + 1}`,
        state: 'open',
        dueAt: new Date('2026-07-29T20:00:00.000Z'),
        version: 5 + index,
      })),
    );
    await testDb.db.insert(orders.orderFulfillments).values(
      fulfillmentIds.map((fulfillmentId, index) => ({
        id: fulfillmentId,
        businessId,
        orderId: orderIds[index]!,
        typeCode: 'wash_fold',
        locationId: 'east',
        releaseState: 'unreleased',
        estimatedWeightLbs: 20,
        estimatedWeightSource: 'source_estimate',
        version: 7 + index,
      })),
    );
    await testDb.db.insert(laundryProduction.orderDemands).values(
      demandIds.map((demandId, index) => ({
        id: demandId,
        fulfillmentId: fulfillmentIds[index]!,
        fulfillmentVersion: 7 + index,
        projectionHash: hash(100 + index),
        admissionState: 'unreleased',
        commercialState: 'open',
        demandKey: `fulfillment:${fulfillmentIds[index]!}`,
        displayReference: `ORDER-${index + 1}`,
        locationId: 'east',
        revisionHash: hash(200 + index),
        revisionAt: sameTime,
        phase: 'expected',
        estimatedWeightLbs: 20,
        estimatedWeightSource: 'source_estimate',
        dueAt: new Date('2026-07-29T20:00:00.000Z'),
      })),
    );
    await testDb.db.insert(laundryProduction.productionOrders).values(
      productionOrderIds.map((productionOrderId, index) => ({
        id: productionOrderId,
        orderDemandId: demandIds[index]!,
        locationId: 'east',
        dueAt: new Date('2026-07-29T20:00:00.000Z'),
        derivedWeightLbs: 20,
        derivedWeightSource: 'external_estimate',
        version: 11 + index,
      })),
    );

    await testDb.db.insert(orders.orderSourceLinks).values({
      id: sourceLinkId,
      source: 'cents',
      externalOrderId: '21122',
      orderId: orderIds[0],
    });
    await testDb.db.insert(orders.orderSourceSnapshots).values({
      sourceLinkId,
      sourceRevisionAt: new Date('2026-07-28T17:58:00.000Z'),
      sourceRevisionHash: hash(300),
      adapterVersion: 'cents-webhook-v2',
      sourceLifecycleCode: 'COMPLETED',
      normalizedPayload: { id: 21122 },
      observedAt: new Date('2026-07-28T17:59:00.000Z'),
    });
    await testDb.db.insert(orders.orderCommandReceipts).values(
      Array.from({ length: 10 }, (_, index) => ({
        idempotencyKey: `order-command-${index.toString().padStart(2, '0')}`,
        commandHash: hash(600 + index),
        origin: 'pressly_dashboard',
        actorKind: 'human',
        actorId: 'manager-1',
        orderId: orderIds[1],
        result: { status: 'applied' },
        reasonCode: `ORDER_${index.toString().padStart(2, '0')}`,
        createdAt: sameTime,
      })),
    );
    await testDb.db.insert(laundryProduction.workEvents).values(
      Array.from({ length: 10 }, (_, index) => ({
        id: uuid(600 + index),
        locationId: 'east',
        eventType: `PRODUCTION_${index.toString().padStart(2, '0')}`,
        entityType: 'production_order',
        entityId: productionOrderIds[2],
        actorId: uuid(700),
        idempotencyKey: `production-command-${index.toString().padStart(2, '0')}`,
        payload: {},
        createdAt: sameTime,
      })),
    );

    const base: ListProductionOrderControlResult = {
      items: [
        makeBaseItem(productionOrderIds[0], fulfillmentIds[0], 11),
        makeBaseItem(productionOrderIds[1], fulfillmentIds[1], 12),
        makeBaseItem(productionOrderIds[2], fulfillmentIds[2], 13),
      ],
      counts: { attention: 0, active: 0, all: 3 },
      nextCursor: null,
      asOf: new Date('2026-07-28T18:01:00.000Z'),
    };
    const experience = makePostgresProcessorExperience({
      db: testDb.db,
      clock: { now: () => sameTime },
      origins: {
        processor: 'https://processor.trypressly.com',
        control: 'https://control.trypressly.com',
      },
      productionCapabilities: { resolveForLocation: () => [] },
    });
    const orderControlAdapter = makeProcessorOrderControlAdapter(
      experience.loadOperationalOrderControlContexts,
    );

    const result = await orderControlAdapter.compose(base);

    expect(result.asOf).toBe('2026-07-28T18:01:00.000Z');
    expect(result.items[0]?.identity).toEqual({
      displayNumber: 'ORDER-1',
      customerDisplayName: 'Santiago Jackson',
    });
    expect(result.items[0]?.canonical).toMatchObject({
      canonicalOrderId: orderIds[0],
      canonicalFulfillmentId: fulfillmentIds[0],
      commercialState: 'open',
      admissionState: 'unreleased',
      versions: { order: 5, fulfillment: 7 },
      source: {
        name: 'cents',
      },
    });
    expect(result.items[0]?.canonical?.audit).toHaveLength(1);
    expect(result.items[0]?.canonical?.audit).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'source_observation',
          code: 'source_observation',
          actor: 'cents',
          outcome: null,
        }),
      ]),
    );
    expect(result.items[1]?.canonical?.source).toBeNull();
    expect(result.items[1]?.canonical?.audit.map(({ code }) => code)).toEqual(
      Array.from(
        { length: 8 },
        (_, index) => `ORDER_${(index + 2).toString().padStart(2, '0')}`,
      ),
    );
    expect(result.items[2]?.canonical?.source).toBeNull();
    expect(result.items[2]?.canonical?.audit.map(({ code }) => code)).toEqual(
      Array.from(
        { length: 8 },
        (_, index) => `PRODUCTION_${(index + 2).toString().padStart(2, '0')}`,
      ),
    );
  });
});
