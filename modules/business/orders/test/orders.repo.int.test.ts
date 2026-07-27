import { eq, orders as schema } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresOrdersApplication } from '../src/main.ts';
import { createOrdersTestDatabase } from './support/database.ts';

const testDb = createOrdersTestDatabase();
const clock = { now: () => new Date('2026-07-21T16:00:00.000Z') };
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
const sourceContext = {
  origin: 'cents',
  principal: { kind: 'system', id: 'cents-webhook' },
} as const;
const baseOrder = {
  customer: {
    resolution: 'not_provided',
    userId: null,
    externalUserId: null,
  } as const,
  displayNumber: 'P-1001',
  state: 'open' as const,
  dueAt: new Date('2026-07-22T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3000,
  balanceDueCents: 3000,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'east',
    releaseState: 'unreleased' as const,
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    bagCount: null,
  },
};

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('Postgres Orders application', () => {
  it('commits a nullable-customer Order, demand outbox, and actor receipt atomically', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const outcome = await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-001',
    });

    expect(outcome.tag).toBe('ok');
    if (outcome.tag === 'err') return;
    await expect(
      testDb.db
        .select({
          customerUserId: schema.orders.customerUserId,
          customerResolution: schema.orders.customerResolution,
          displayNumber: schema.orders.displayNumber,
        })
        .from(schema.orders),
    ).resolves.toEqual([
      {
        customerUserId: null,
        customerResolution: 'not_provided',
        displayNumber: 'P-1001',
      },
    ]);
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db
        .select({
          origin: schema.orderCommandReceipts.origin,
          actorKind: schema.orderCommandReceipts.actorKind,
          actorId: schema.orderCommandReceipts.actorId,
        })
        .from(schema.orderCommandReceipts),
    ).resolves.toEqual([
      {
        origin: 'pressly_dashboard',
        actorKind: 'human',
        actorId: 'identity-1',
      },
    ]);
  });

  it('rolls back the Order and outbox together when customer integrity fails', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const outcome = await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-002',
      customer: {
        resolution: 'resolved',
        userId: '00000000-0000-4000-8000-000000000999',
        externalUserId: null,
      },
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'order_create_failed' },
    });
    await expect(testDb.db.select().from(schema.orders)).resolves.toHaveLength(
      0,
    );
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(0);
  });

  it('serializes concurrent exact-source observations to one Order and outbox effect', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const command = {
      ...baseOrder,
      context: sourceContext,
      source: 'cents',
      externalOrderId: '7472010',
      revision: {
        at: clock.now(),
        observedAt: clock.now(),
        hash: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'SUBMITTED',
        normalizedPayload: { order: { id: 7472010, status: 'SUBMITTED' } },
      },
    } as const;

    const outcomes = await Promise.all([
      application.observeSource(command),
      application.observeSource(command),
    ]);

    expect(outcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    await expect(testDb.db.select().from(schema.orders)).resolves.toHaveLength(
      1,
    );
    await expect(
      testDb.db.select().from(schema.orderSourceLinks),
    ).resolves.toHaveLength(1);
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(1);
    expect(
      outcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.outcome : 'error',
      ),
    ).toEqual(expect.arrayContaining(['created', 'replayed']));
  });

  it('retains post-handoff lifecycle observations without changing canonical state or outbox', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const sourceOrder = {
      ...baseOrder,
      context: sourceContext,
      source: 'cents',
      externalOrderId: '7472020',
    } as const;
    const submittedAt = new Date('2026-07-21T15:00:00.000Z');
    const created = await application.observeSource({
      ...sourceOrder,
      revision: {
        at: submittedAt,
        observedAt: submittedAt,
        hash: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'SUBMITTED',
        normalizedPayload: { order: { id: 7472020, status: 'SUBMITTED' } },
      },
    });
    expect(created).toMatchObject({
      tag: 'ok',
      value: { outcome: 'created', version: 1 },
    });

    const handoffAt = new Date('2026-07-21T15:10:00.000Z');
    const handoff = await application.observeSource({
      ...sourceOrder,
      fulfillment: {
        ...sourceOrder.fulfillment,
        releaseState: 'released',
      },
      revision: {
        at: handoffAt,
        observedAt: handoffAt,
        hash: 'b'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'IN_PROGRESS',
        normalizedPayload: { order: { id: 7472020, status: 'IN_PROGRESS' } },
      },
    });
    expect(handoff).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', version: 2 },
    });

    const canceledAt = new Date('2026-07-21T15:20:00.000Z');
    const canceled = await application.observeSource({
      ...sourceOrder,
      state: 'canceled',
      fulfillment: {
        ...sourceOrder.fulfillment,
        releaseState: 'withdrawn',
      },
      revision: {
        at: canceledAt,
        observedAt: canceledAt,
        hash: 'c'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'CANCELED',
        normalizedPayload: { order: { id: 7472020, status: 'CANCELED' } },
      },
    });
    expect(canceled).toMatchObject({
      tag: 'ok',
      value: { outcome: 'observed_only', version: 2 },
    });
    await expect(
      testDb.db
        .select({
          state: schema.orders.state,
          orderVersion: schema.orders.version,
          releaseState: schema.orderFulfillments.releaseState,
          fulfillmentVersion: schema.orderFulfillments.version,
        })
        .from(schema.orders)
        .innerJoin(
          schema.orderFulfillments,
          eq(schema.orderFulfillments.orderId, schema.orders.id),
        ),
    ).resolves.toEqual([
      {
        state: 'open',
        orderVersion: 2,
        releaseState: 'released',
        fulfillmentVersion: 2,
      },
    ]);
    await expect(
      testDb.db
        .select({
          lifecycle: schema.orderSourceSnapshots.sourceLifecycleCode,
          revisionAt: schema.orderSourceSnapshots.sourceRevisionAt,
        })
        .from(schema.orderSourceSnapshots),
    ).resolves.toEqual([{ lifecycle: 'CANCELED', revisionAt: canceledAt }]);
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(2);

    const revisedDueAt = new Date('2026-07-23T20:00:00.000Z');
    const completedAt = new Date('2026-07-21T15:30:00.000Z');
    const nonLifecycleUpdate = await application.observeSource({
      ...sourceOrder,
      state: 'completed',
      dueAt: revisedDueAt,
      fulfillment: {
        ...sourceOrder.fulfillment,
        releaseState: 'released',
      },
      revision: {
        at: completedAt,
        observedAt: completedAt,
        hash: 'd'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'COMPLETED',
        normalizedPayload: { order: { id: 7472020, status: 'COMPLETED' } },
      },
    });
    expect(nonLifecycleUpdate).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', version: 3 },
    });
    await expect(
      testDb.db
        .select({
          state: schema.orders.state,
          dueAt: schema.orders.dueAt,
          version: schema.orders.version,
        })
        .from(schema.orders),
    ).resolves.toEqual([{ state: 'open', dueAt: revisedDueAt, version: 3 }]);
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(3);
  });

  it('adopts a source cancellation only while fulfillment is unreleased', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const sourceOrder = {
      ...baseOrder,
      context: sourceContext,
      source: 'cents',
      externalOrderId: '7472030',
    } as const;
    const submittedAt = new Date('2026-07-21T15:00:00.000Z');
    await application.observeSource({
      ...sourceOrder,
      revision: {
        at: submittedAt,
        observedAt: submittedAt,
        hash: 'a'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'SUBMITTED',
        normalizedPayload: { order: { id: 7472030, status: 'SUBMITTED' } },
      },
    });

    const canceledAt = new Date('2026-07-21T15:10:00.000Z');
    const canceled = await application.observeSource({
      ...sourceOrder,
      state: 'canceled',
      fulfillment: {
        ...sourceOrder.fulfillment,
        releaseState: 'withdrawn',
      },
      revision: {
        at: canceledAt,
        observedAt: canceledAt,
        hash: 'b'.repeat(64),
        adapterVersion: 'cents-webhook-v2',
        lifecycleCode: 'CANCELED',
        normalizedPayload: { order: { id: 7472030, status: 'CANCELED' } },
      },
    });

    expect(canceled).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', version: 2 },
    });
    await expect(
      testDb.db
        .select({
          state: schema.orders.state,
          releaseState: schema.orderFulfillments.releaseState,
        })
        .from(schema.orders)
        .innerJoin(
          schema.orderFulfillments,
          eq(schema.orderFulfillments.orderId, schema.orders.id),
        ),
    ).resolves.toEqual([{ state: 'canceled', releaseState: 'withdrawn' }]);
  });

  it('lease-fences an outbox claim and makes an explicit retry claimable later', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-003',
    });
    const claimed = await application.claimOutbox({
      workerId: 'worker-1',
      limit: 10,
      leaseMs: 30_000,
    });
    expect(claimed.tag).toBe('ok');
    if (claimed.tag === 'err' || claimed.value[0] === undefined) return;

    await expect(
      application.completeOutbox({
        eventId: claimed.value[0].id,
        workerId: 'worker-2',
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { completed: false } });
    await expect(
      application.retryOutbox({
        eventId: claimed.value[0].id,
        workerId: 'worker-1',
        availableAt: new Date('2026-07-21T15:59:00.000Z'),
        errorCode: 'temporary_failure',
        errorMessage: 'Temporary downstream failure.',
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: { retried: true } });
    await expect(
      application.claimOutbox({
        workerId: 'worker-2',
        limit: 10,
        leaseMs: 30_000,
      }),
    ).resolves.toMatchObject({ tag: 'ok', value: [{ attempts: 2 }] });
  });

  it('checks the persisted Fulfillment location for direct Order mutations', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    const created = await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-location-scope',
    });
    expect(created.tag).toBe('ok');
    if (created.tag === 'err') return;

    await expect(
      application.updateOrder({
        idempotencyKey: 'update-order-wrong-location',
        context: directContext,
        locationId: 'west',
        orderId: created.value.orderId,
        expectedVersion: 1,
        changes: { displayNumber: 'P-OTHER' },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_not_found' },
    });
    await expect(
      application.changeFulfillmentRelease({
        idempotencyKey: 'release-order-wrong-location',
        context: directContext,
        fulfillmentId: created.value.fulfillmentId,
        locationId: 'west',
        expectedVersion: 1,
        target: 'released',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_not_found' },
    });
  });

  it('terminalizes a leased outbox record and never claims it again', async () => {
    const application = makePostgresOrdersApplication({ db: testDb.db, clock });
    await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-dead-letter',
    });
    const claimed = await application.claimOutbox({
      workerId: 'worker-1',
      limit: 10,
      leaseMs: 30_000,
    });
    expect(claimed).toMatchObject({
      tag: 'ok',
      value: [
        {
          kind: 'fulfillment_demand_changed',
          payload: {
            schemaVersion: 1,
            eventType: 'fulfillment_demand_changed',
          },
        },
      ],
    });
    if (claimed.tag === 'err' || claimed.value[0] === undefined) return;

    await expect(
      application.deadLetterOutbox({
        eventId: claimed.value[0].id,
        workerId: 'worker-2',
        errorCode: 'invalid_event',
        errorMessage: 'Invalid durable event.',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { deadLettered: false },
    });
    await expect(
      application.deadLetterOutbox({
        eventId: claimed.value[0].id,
        workerId: 'worker-1',
        errorCode: 'invalid_event',
        errorMessage: 'Invalid durable event.',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { deadLettered: true },
    });
    await expect(
      testDb.db
        .select({
          status: schema.orderOutboxEvents.status,
          deadAt: schema.orderOutboxEvents.deadAt,
          errorCode: schema.orderOutboxEvents.lastErrorCode,
        })
        .from(schema.orderOutboxEvents),
    ).resolves.toEqual([
      {
        status: 'dead',
        deadAt: clock.now(),
        errorCode: 'invalid_event',
      },
    ]);
    await expect(
      application.claimOutbox({
        workerId: 'worker-2',
        limit: 10,
        leaseMs: 30_000,
      }),
    ).resolves.toEqual({ tag: 'ok', value: [] });
  });
});
