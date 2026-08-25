import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { completeOrderCellDeclaration, makeCompleteOrderCell } from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofBusinessId,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationId,
  ordersPostgresProofOrderId,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('complete-order');

const command = (idempotencyKey: string, reasonNote: string | null = null) => ({
  businessId: ordersPostgresProofBusinessId,
  locationId: ordersPostgresProofLocationId,
  orderId: ordersPostgresProofOrderId,
  expectedVersion: 1,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'service_completed' as const,
  reasonNote,
});

const completeCell = () =>
  makeCompleteOrderCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
  });

const completeDurableState = async () => {
  const [orders, receipts, outbox] = await Promise.all([
    ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderCommandReceipts),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderOutboxEvents),
  ]);
  return { orders, receipts, outbox };
};

proveOperation({
  operationId: 'orders.complete-order.v1',
  declaration: completeOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes completion replay, rejects divergent and terminal commands, and rolls back state, receipt and outbox together',
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
        const cell = completeCell();
        const firstCommand = command('complete-order-1');
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
        expect(stored).toMatchObject({ state: 'completed', version: 2 });
        await expect(
          cell.execute(command('complete-order-1', 'divergent')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute({
            ...command('complete-order-terminal'),
            expectedVersion: 2,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_transition_invalid' },
        });

        const rollbackOrderId = '78000000-0000-4000-8000-000000000022';
        await seedOrdersPostgresCanonicalOrder({
          orderId: rollbackOrderId,
          fulfillmentId: '78000000-0000-4000-8000-000000000023',
        });
        await installOrdersPostgresInsertFault('order_command_receipts');
        await expect(
          cell.execute({
            ...command('complete-order-rollback'),
            orderId: rollbackOrderId,
          }),
        ).rejects.toMatchObject({ code: 'order_lifecycle_command_failed' });
        const [rolledBack] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orders)
          .where(eq(ordersTestSchema.orders.id, rollbackOrderId));
        expect(rolledBack).toMatchObject({ state: 'open', version: 1 });
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
  operationId: 'orders.complete-order.v1',
  declaration: completeOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'rejects order_not_found without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await completeDurableState();
        await expect(
          completeCell().execute({
            ...command('complete-order-not-found'),
            orderId: '78000000-0000-4000-8000-000000000098',
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'order_not_found' },
        });
        expect(await completeDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects order_version_conflict without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await completeDurableState();
        await expect(
          completeCell().execute({
            ...command('complete-order-version-conflict'),
            expectedVersion: 2,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'order_version_conflict' },
        });
        expect(await completeDurableState()).toEqual(before);
      },
    },
  ],
});
