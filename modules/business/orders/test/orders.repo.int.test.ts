import { eq, orders as schema, users as userSchema } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  makePostgresOrdersApplication,
  makePostgresOrdersWorkerApplication,
  type OrdersApplication,
} from '../src/main.ts';
import { createOrdersTestDatabase } from './support/database.ts';

const testDb = createOrdersTestDatabase();
const clock = { now: () => new Date('2026-07-21T16:00:00.000Z') };
const incomingOrderProposalCustomer = {
  resolveOrCreate: async (): Promise<never> => {
    throw new Error('Incoming proposal customer persistence is not used here.');
  },
};
const directContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
const sourceContext = {
  origin: 'cents',
  principal: { kind: 'system', id: 'cents-webhook' },
} as const;
const baseOrder = {
  reasonCode: 'new_customer_order' as const,
  reasonNote: null,
  customer: {
    resolution: 'not_provided',
    userId: null,
    externalUserId: null,
  } as const,
  displayNumber: 'P-1001',
  dueAt: new Date('2026-07-22T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3000,
  balanceDueCents: 3000,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'east',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
  },
};

const submittedProposal = (externalOrderId: string) => ({
  context: sourceContext,
  source: 'external-orders',
  externalOrderId,
  proposalKind: 'submitted_order' as const,
  snapshot: {
    customer: null,
    displayNumber: `P-${externalOrderId}`,
    dueAt: baseOrder.dueAt,
    currency: baseOrder.currency,
    totalAmountCents: baseOrder.totalAmountCents,
    balanceDueCents: baseOrder.balanceDueCents,
    items: baseOrder.items,
    fulfillment: baseOrder.fulfillment,
  },
  revision: {
    at: new Date('2026-07-21T15:59:00.000Z'),
    observedAt: clock.now(),
    hash: 'b'.repeat(64),
    adapterVersion: 'external-orders-v1',
    normalizedPayload: { order: { id: externalOrderId } },
  },
});

const sourceTerminal = (
  externalOrderId: string,
  terminalCode: 'completed' | 'canceled' = 'completed',
) => ({
  context: sourceContext,
  source: 'external-orders',
  externalOrderId,
  terminalCode,
  revision: {
    at: new Date('2026-07-21T16:05:00.000Z'),
    observedAt: new Date('2026-07-21T16:05:01.000Z'),
    hash: 'c'.repeat(64),
    adapterVersion: 'external-orders-v1',
    normalizedPayload: {
      order: { id: externalOrderId, state: terminalCode },
    },
  },
});

const storedProposalId = async (
  application: OrdersApplication,
  externalOrderId: string,
): Promise<string> => {
  const outcome = await application.proposeIncomingOrder(
    submittedProposal(externalOrderId),
  );
  if (outcome.tag === 'err' || outcome.value.proposalId === null)
    throw new Error('Expected an incoming Order proposal.');
  return outcome.value.proposalId;
};

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('Postgres Orders application', () => {
  it('accepts one immutable submitted candidate into one unreleased canonical Order transaction', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const proposed = await application.proposeIncomingOrder({
      context: sourceContext,
      source: 'external-orders',
      externalOrderId: 'submitted-proposal-1',
      proposalKind: 'submitted_order',
      snapshot: {
        customer: null,
        displayNumber: 'P-PICKUP-1',
        dueAt: baseOrder.dueAt,
        currency: baseOrder.currency,
        totalAmountCents: baseOrder.totalAmountCents,
        balanceDueCents: baseOrder.balanceDueCents,
        items: baseOrder.items,
        fulfillment: baseOrder.fulfillment,
      },
      revision: {
        at: new Date('2026-07-21T15:59:00.000Z'),
        observedAt: clock.now(),
        hash: 'b'.repeat(64),
        adapterVersion: 'external-orders-v1',
        normalizedPayload: { order: { id: 'submitted-proposal-1' } },
      },
    });
    expect(proposed).toMatchObject({
      tag: 'ok',
      value: { outcome: 'proposed', version: 1 },
    });
    if (proposed.tag === 'err' || proposed.value.proposalId === null) return;
    await expect(
      testDb.db
        .update(schema.orderSourceProposals)
        .set({ displayNumber: 'MUTATED' })
        .where(eq(schema.orderSourceProposals.id, proposed.value.proposalId)),
    ).rejects.toThrow();
    expect(
      await testDb.db
        .select({ displayNumber: schema.orderSourceProposals.displayNumber })
        .from(schema.orderSourceProposals)
        .where(eq(schema.orderSourceProposals.id, proposed.value.proposalId)),
    ).toEqual([{ displayNumber: 'P-PICKUP-1' }]);

    const accepted = await application.acceptIncomingOrderProposal({
      proposalId: proposed.value.proposalId,
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'accept-submitted-proposal-1',
      context: directContext,
      reasonCode: 'incoming_order_accepted',
      reasonNote: null,
    });
    expect(accepted).toMatchObject({
      tag: 'ok',
      value: { state: 'accepted', version: 2, replayed: false },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceProposals),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toMatchObject([{ decision: 'accepted', proposalVersion: 2 }]);
    await expect(
      testDb.db
        .update(schema.orderSourceProposalResolutions)
        .set({ reasonNote: 'MUTATED' })
        .where(
          eq(
            schema.orderSourceProposalResolutions.proposalId,
            proposed.value.proposalId,
          ),
        ),
    ).rejects.toThrow();
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderFulfillments),
    ).toMatchObject([{ releaseState: 'unreleased', version: 1 }]);
    expect(
      await testDb.db.select().from(schema.orderCommandReceipts),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderOutboxEvents),
    ).toHaveLength(1);

    const replay = await application.acceptIncomingOrderProposal({
      proposalId: proposed.value.proposalId,
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'accept-submitted-proposal-1',
      context: directContext,
      reasonCode: 'incoming_order_accepted',
      reasonNote: null,
    });
    expect(replay).toMatchObject({
      tag: 'ok',
      value: { state: 'accepted', replayed: true },
    });
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderOutboxEvents),
    ).toHaveLength(1);

    const laterSubmission = await application.proposeIncomingOrder(
      submittedProposal('submitted-proposal-1'),
    );
    expect(laterSubmission).toMatchObject({
      tag: 'ok',
      value: {
        proposalId: null,
        outcome: 'existing_order',
        replayed: true,
      },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceProposals),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toHaveLength(1);
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderOutboxEvents),
    ).toHaveLength(1);
  });

  it('serializes concurrent duplicate submitted candidates to one immutable proposal', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const command = submittedProposal('submitted-concurrent-submit');

    const outcomes = await Promise.all([
      application.proposeIncomingOrder(command),
      application.proposeIncomingOrder(command),
    ]);

    expect(outcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    expect(
      outcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.outcome : null,
      ),
    ).toEqual(expect.arrayContaining(['proposed', 'existing_proposal']));
    expect(
      new Set(
        outcomes.flatMap((outcome) =>
          outcome.tag === 'ok' && outcome.value.proposalId !== null
            ? [outcome.value.proposalId]
            : [],
        ),
      ).size,
    ).toBe(1);
    expect(
      await testDb.db.select().from(schema.orderSourceProposals),
    ).toHaveLength(1);
  });

  it('tombstones terminal evidence that arrives before the submitted candidate', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const worker = makePostgresOrdersWorkerApplication({
      db: testDb.db,
      clock,
    });
    const externalOrderId = 'terminal-before-submitted';

    await expect(
      worker.closeIncomingOrderSource(
        sourceTerminal(externalOrderId, 'canceled'),
      ),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'tombstoned',
        proposalId: null,
        replayed: false,
      },
    });
    await expect(
      application.proposeIncomingOrder(submittedProposal(externalOrderId)),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'source_closed',
        proposalId: null,
        replayed: true,
      },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceTerminalTombstones),
    ).toMatchObject([
      {
        externalOrderId,
        terminalCode: 'canceled',
        proposalId: null,
      },
    ]);
    expect(await testDb.db.select().from(schema.orderSourceProposals)).toEqual(
      [],
    );
  });

  it('persists source close, manager restore, and acceptance as graph edges', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const worker = makePostgresOrdersWorkerApplication({
      db: testDb.db,
      clock,
    });
    const externalOrderId = 'source-close-restore-accept';
    const proposalId = await storedProposalId(application, externalOrderId);

    await expect(
      worker.closeIncomingOrderSource(sourceTerminal(externalOrderId)),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'source_closed',
        proposalId,
        version: 2,
      },
    });
    await expect(
      application.restoreIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 2,
        idempotencyKey: 'restore-source-closed-candidate',
        context: directContext,
        reasonCode: 'source_closure_overridden',
        reasonNote: 'Manager verified that the physical work remains active.',
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        state: 'restored_pending',
        version: 3,
        replayed: false,
      },
    });
    await expect(
      worker.closeIncomingOrderSource(sourceTerminal(externalOrderId)),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        outcome: 'already_decided',
        proposalId,
        version: 3,
        replayed: true,
      },
    });
    await expect(
      application.acceptIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 3,
        idempotencyKey: 'accept-restored-candidate',
        context: directContext,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        state: 'accepted',
        version: 4,
        replayed: false,
      },
    });
    expect(
      await testDb.db
        .select({
          fromState: schema.orderSourceProposalTransitions.fromState,
          toState: schema.orderSourceProposalTransitions.toState,
          eventType: schema.orderSourceProposalTransitions.eventType,
          proposalVersion:
            schema.orderSourceProposalTransitions.proposalVersion,
        })
        .from(schema.orderSourceProposalTransitions),
    ).toEqual([
      {
        fromState: 'pending',
        toState: 'source_closed',
        eventType: 'source_close',
        proposalVersion: 2,
      },
      {
        fromState: 'source_closed',
        toState: 'restored_pending',
        eventType: 'restore',
        proposalVersion: 3,
      },
      {
        fromState: 'restored_pending',
        toState: 'accepted',
        eventType: 'accept',
        proposalVersion: 4,
      },
    ]);
    expect(
      await testDb.db.select().from(schema.orderFulfillments),
    ).toMatchObject([{ releaseState: 'unreleased' }]);
  });

  it('serializes concurrent acceptance to one canonical effect and one terminal resolution', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const proposalId = await storedProposalId(
      application,
      'submitted-concurrent-accept',
    );
    const command = {
      proposalId,
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'accept-submitted-concurrent',
      context: directContext,
      reasonCode: 'incoming_order_accepted' as const,
      reasonNote: null,
    };

    const outcomes = await Promise.all([
      application.acceptIncomingOrderProposal(command),
      application.acceptIncomingOrderProposal(command),
    ]);

    expect(outcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    expect(
      outcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.replayed : null,
      ),
    ).toEqual(expect.arrayContaining([false, true]));
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toHaveLength(1);
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderFulfillments),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderOutboxEvents),
    ).toHaveLength(1);
  });

  it('rejects a proposal terminally without creating canonical work', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const proposalId = await storedProposalId(
      application,
      'submitted-manager-reject',
    );

    await expect(
      application.rejectIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 1,
        idempotencyKey: 'reject-submitted-manager',
        context: directContext,
        reasonCode: 'not_pressly_work',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        state: 'rejected',
        version: 2,
        orderId: null,
        fulfillmentId: null,
      },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toMatchObject([{ decision: 'rejected', proposalVersion: 2 }]);
    expect(await testDb.db.select().from(userSchema.users)).toEqual([]);
    expect(await testDb.db.select().from(schema.orders)).toEqual([]);
    expect(await testDb.db.select().from(schema.orderFulfillments)).toEqual([]);
    expect(await testDb.db.select().from(schema.orderOutboxEvents)).toEqual([]);

    const laterSubmission = await application.proposeIncomingOrder(
      submittedProposal('submitted-manager-reject'),
    );
    expect(laterSubmission).toMatchObject({
      tag: 'ok',
      value: {
        proposalId,
        outcome: 'existing_proposal',
        replayed: true,
      },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceProposals),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toHaveLength(1);
    expect(await testDb.db.select().from(schema.orders)).toEqual([]);
  });

  it('does not permit a decided proposal to accept or reject a different command', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const proposalId = await storedProposalId(
      application,
      'submitted-already-decided',
    );
    await application.rejectIncomingOrderProposal({
      proposalId,
      locationId: 'east',
      expectedVersion: 1,
      idempotencyKey: 'reject-submitted-first',
      context: directContext,
      reasonCode: 'already_handled',
      reasonNote: null,
    });

    await expect(
      application.acceptIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 1,
        idempotencyKey: 'accept-submitted-after-reject',
        context: directContext,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_transition_invalid' },
    });
    await expect(
      application.rejectIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 1,
        idempotencyKey: 'reject-submitted-second',
        context: directContext,
        reasonCode: 'manager_rejected',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_transition_invalid' },
    });
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toHaveLength(1);
    expect(await testDb.db.select().from(schema.orders)).toEqual([]);
  });

  it('lets an exact canonical source link win before acceptance without duplicating the Order', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const externalOrderId = 'submitted-link-race';
    const proposalId = await storedProposalId(application, externalOrderId);
    const canonical = await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-race-winner',
    });
    if (canonical.tag === 'err')
      throw new Error('Expected the canonical Order race winner.');
    await testDb.db.insert(schema.orderSourceLinks).values({
      source: 'external-orders',
      externalOrderId,
      orderId: canonical.value.orderId,
    });

    await expect(
      application.acceptIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 1,
        idempotencyKey: 'accept-after-exact-link',
        context: directContext,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_identity_conflict' },
    });
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderFulfillments),
    ).toHaveLength(1);
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toEqual([]);
    expect(
      await testDb.db.select().from(schema.orderOutboxEvents),
    ).toHaveLength(1);
  });

  it('blocks acceptance when the exact canonical source link has no fulfillment', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const externalOrderId = 'submitted-link-without-fulfillment';
    const proposalId = await storedProposalId(application, externalOrderId);
    const [canonical] = await testDb.db
      .insert(schema.orders)
      .values({
        customerResolution: 'not_provided',
        displayNumber: 'P-NO-FULFILLMENT',
        dueAt: baseOrder.dueAt,
        currency: 'USD',
        totalAmountCents: 0,
        balanceDueCents: 0,
      })
      .returning({ id: schema.orders.id });
    if (canonical === undefined)
      throw new Error('Expected a canonical Order without fulfillment.');
    await testDb.db.insert(schema.orderSourceLinks).values({
      source: 'external-orders',
      externalOrderId,
      orderId: canonical.id,
    });
    const listed = await application.listIncomingOrderProposals({
      locationId: 'east',
      limit: 25,
      cursor: null,
      view: 'needs_review',
    });
    expect(listed).toMatchObject({
      tag: 'ok',
      value: {
        items: [
          {
            id: proposalId,
            availableActions: ['reject'],
            acceptBlockedReason: 'exact_order_exists',
          },
        ],
      },
    });

    await expect(
      application.acceptIncomingOrderProposal({
        proposalId,
        locationId: 'east',
        expectedVersion: 1,
        idempotencyKey: 'accept-after-link-without-fulfillment',
        context: directContext,
        reasonCode: 'incoming_order_accepted',
        reasonNote: null,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'incoming_order_proposal_identity_conflict' },
    });
    expect(await testDb.db.select().from(schema.orders)).toHaveLength(1);
    expect(await testDb.db.select().from(schema.orderFulfillments)).toEqual([]);
    expect(
      await testDb.db.select().from(schema.orderSourceProposalResolutions),
    ).toEqual([]);
    expect(await testDb.db.select().from(schema.orderOutboxEvents)).toEqual([]);
  });

  it('commits a nullable-customer Order, demand outbox, and actor receipt atomically', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
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
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
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

  it('lease-fences an outbox claim and makes an explicit retry claimable later', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
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
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const created = await application.createOrder({
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-location-scope',
    });
    expect(created.tag).toBe('ok');
    if (created.tag === 'err') return;

    await expect(
      application.correctOrder({
        idempotencyKey: 'update-order-wrong-location',
        context: directContext,
        reasonCode: 'customer_correction',
        reasonNote: null,
        locationId: 'west',
        orderId: created.value.orderId,
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
        changes: { displayNumber: 'P-OTHER' },
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'order_not_found' },
    });
    await expect(
      application.releaseFulfillment({
        idempotencyKey: 'release-order-wrong-location',
        context: directContext,
        reasonCode: 'ready_for_production',
        reasonNote: null,
        fulfillmentId: created.value.fulfillmentId,
        locationId: 'west',
        expectedOrderVersion: 1,
        expectedFulfillmentVersion: 1,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'fulfillment_not_found' },
    });
  });

  it('serializes concurrent exact canonical commands to one effect and one audited receipt', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
    const command = {
      ...baseOrder,
      context: directContext,
      idempotencyKey: 'create-order-concurrent',
    } as const;

    const outcomes = await Promise.all([
      application.createOrder(command),
      application.createOrder(command),
    ]);

    expect(outcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    expect(
      outcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.replayed : null,
      ),
    ).toEqual(expect.arrayContaining([false, true]));
    const created = outcomes.find(
      (outcome) => outcome.tag === 'ok' && !outcome.value.replayed,
    );
    if (created?.tag !== 'ok') return;
    const cancelCommand = {
      idempotencyKey: 'cancel-order-concurrent',
      context: directContext,
      reasonCode: 'created_in_error' as const,
      reasonNote: null,
      locationId: 'east',
      orderId: created.value.orderId,
      expectedVersion: 1,
    };
    const cancelOutcomes = await Promise.all([
      application.cancelOrder(cancelCommand),
      application.cancelOrder(cancelCommand),
    ]);
    expect(cancelOutcomes.every((outcome) => outcome.tag === 'ok')).toBe(true);
    expect(
      cancelOutcomes.map((outcome) =>
        outcome.tag === 'ok' ? outcome.value.replayed : null,
      ),
    ).toEqual(expect.arrayContaining([false, true]));
    await expect(testDb.db.select().from(schema.orders)).resolves.toHaveLength(
      1,
    );
    await expect(
      testDb.db.select().from(schema.orderOutboxEvents),
    ).resolves.toHaveLength(2);
    await expect(
      testDb.db
        .select({
          reasonCode: schema.orderCommandReceipts.reasonCode,
          reasonNote: schema.orderCommandReceipts.reasonNote,
        })
        .from(schema.orderCommandReceipts),
    ).resolves.toEqual(
      expect.arrayContaining([
        { reasonCode: 'new_customer_order', reasonNote: null },
        { reasonCode: 'created_in_error', reasonNote: null },
      ]),
    );
  });

  it('terminalizes a leased outbox record and never claims it again', async () => {
    const application = makePostgresOrdersApplication({
      db: testDb.db,
      clock,
      incomingOrderProposalCustomer,
    });
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
