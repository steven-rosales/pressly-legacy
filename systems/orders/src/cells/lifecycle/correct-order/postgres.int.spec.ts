import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { correctOrderCellDeclaration, makeCorrectOrderCell } from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofBusinessId,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofCustomerReference,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationId,
  ordersPostgresProofOrderId,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('correct-order');

const command = (
  idempotencyKey: string,
  displayNumber = 'P-CORRECTED',
  expectedOrderVersion = 1,
) => ({
  businessId: ordersPostgresProofBusinessId,
  locationId: ordersPostgresProofLocationId,
  orderId: ordersPostgresProofOrderId,
  expectedOrderVersion,
  expectedFulfillmentVersion: 1,
  changes: { displayNumber },
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'customer_correction' as const,
  reasonNote: null,
});

const correctCell = (
  customerReferenceV1 = ordersPostgresProofCustomerReference,
) =>
  makeCorrectOrderCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
    customerReferenceV1,
  });

const correctionDurableState = async () => {
  const [orders, fulfillments, items, receipts, outbox] = await Promise.all([
    ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderFulfillments),
    ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orderItems),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderCommandReceipts),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderOutboxEvents),
  ]);
  return { orders, fulfillments, items, receipts, outbox };
};

proveOperation({
  operationId: 'orders.correct-order.v1',
  declaration: correctOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes correction replay, rejects divergent and stale commands, and rolls back Order, receipt and outbox together',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'divergent-key-conflict',
        'same-key-concurrency',
        'declared-concurrency-race',
        'state-message-atomicity',
        'message-compatibility',
      ],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const cell = correctCell();
        const firstCommand = command('correct-order-1');
        const outcomes = await Promise.all([
          cell.execute(firstCommand),
          cell.execute(firstCommand),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        const [stored] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orders)
          .where(eq(ordersTestSchema.orders.id, ordersPostgresProofOrderId));
        expect(stored).toMatchObject({
          displayNumber: 'P-CORRECTED',
          version: 2,
        });
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        ).resolves.toHaveLength(1);

        await expect(
          cell.execute(command('correct-order-1', 'P-DIVERGENT')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute(command('correct-order-stale', 'P-STALE', 1)),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_version_conflict' },
        });

        const rollbackOrderId = '78000000-0000-4000-8000-000000000012';
        const rollbackFulfillmentId = '78000000-0000-4000-8000-000000000013';
        await seedOrdersPostgresCanonicalOrder({
          orderId: rollbackOrderId,
          fulfillmentId: rollbackFulfillmentId,
        });
        await installOrdersPostgresInsertFault('order_command_receipts');
        await expect(
          cell.execute({
            ...command('correct-order-rollback', 'P-ROLLBACK'),
            orderId: rollbackOrderId,
          }),
        ).rejects.toMatchObject({ code: 'order_correction_failed' });
        const [rolledBack] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orders)
          .where(eq(ordersTestSchema.orders.id, rollbackOrderId));
        expect(rolledBack).toMatchObject({
          displayNumber: 'P-780',
          version: 1,
        });
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents)
            .where(
              eq(ordersTestSchema.orderOutboxEvents.orderId, rollbackOrderId),
            ),
        ).resolves.toHaveLength(0);
      },
    },
  ],
});

proveOperation({
  operationId: 'orders.correct-order.v1',
  declaration: correctOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'rejects order_correction_invalid without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await correctionDurableState();
        await expect(
          correctCell().execute({
            ...command('correct-order-invalid'),
            changes: {},
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'validation', code: 'order_correction_invalid' },
        });
        expect(await correctionDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects order_not_found without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await correctionDurableState();
        await expect(
          correctCell().execute({
            ...command('correct-order-not-found'),
            orderId: '78000000-0000-4000-8000-000000000095',
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'order_not_found' },
        });
        expect(await correctionDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects order_customer_not_found without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await correctionDurableState();
        const customerMissing = {
          contract: { version: 1 },
          execute: async () => null,
        } as never;
        await expect(
          correctCell(customerMissing).execute({
            ...command('correct-order-customer-not-found'),
            changes: {
              customer: {
                resolution: 'resolved',
                userId: '78000000-0000-4000-8000-000000000094',
                externalUserId: null,
              },
            },
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'order_customer_not_found' },
        });
        expect(await correctionDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects order_location_move_requires_command without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await correctionDurableState();
        await expect(
          correctCell().execute({
            ...command('correct-order-location-move'),
            changes: {
              fulfillment: { locationId: 'orders-other-location' },
            },
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'order_location_move_requires_command',
          },
        });
        expect(await correctionDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects fulfillment_commitment_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const before = await correctionDurableState();
        await expect(
          correctCell().execute({
            ...command('correct-order-fulfillment-committed'),
            changes: { fulfillment: { typeCode: 'dry_clean' } },
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'fulfillment_commitment_conflict',
          },
        });
        expect(await correctionDurableState()).toEqual(before);
      },
    },
  ],
});
