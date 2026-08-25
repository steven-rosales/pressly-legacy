import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makeReleaseFulfillmentCell,
  releaseFulfillmentCellDeclaration,
} from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofBusinessId,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofDatabase,
  ordersPostgresProofFulfillmentId,
  ordersPostgresProofLocationId,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('release-fulfillment');

const command = (idempotencyKey: string, reasonNote: string | null = null) => ({
  businessId: ordersPostgresProofBusinessId,
  fulfillmentId: ordersPostgresProofFulfillmentId,
  locationId: ordersPostgresProofLocationId,
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'ready_for_production' as const,
  reasonNote,
});

const releaseCell = () =>
  makeReleaseFulfillmentCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
  });

const releaseDurableState = async () => {
  const [orders, fulfillments, receipts, outbox] = await Promise.all([
    ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderFulfillments),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderCommandReceipts),
    ordersPostgresProofDatabase.db
      .select()
      .from(ordersTestSchema.orderOutboxEvents),
  ]);
  return { orders, fulfillments, receipts, outbox };
};

proveOperation({
  operationId: 'orders.release-fulfillment.v1',
  declaration: releaseFulfillmentCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes release replay, rejects divergent and stale commands, and rolls back fulfillment, Order, receipt and outbox together',
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
        const cell = releaseCell();
        const firstCommand = command('release-fulfillment-1');
        const outcomes = await Promise.all([
          cell.execute(firstCommand),
          cell.execute(firstCommand),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        const [fulfillment] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orderFulfillments)
          .where(
            eq(
              ordersTestSchema.orderFulfillments.id,
              ordersPostgresProofFulfillmentId,
            ),
          );
        expect(fulfillment).toMatchObject({
          releaseState: 'released',
          version: 2,
        });
        await expect(
          cell.execute(command('release-fulfillment-1', 'divergent')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute({
            ...command('release-fulfillment-stale'),
            expectedOrderVersion: 1,
            expectedFulfillmentVersion: 1,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'fulfillment_version_conflict' },
        });

        const rollbackOrderId = '78000000-0000-4000-8000-000000000042';
        const rollbackFulfillmentId = '78000000-0000-4000-8000-000000000043';
        await seedOrdersPostgresCanonicalOrder({
          orderId: rollbackOrderId,
          fulfillmentId: rollbackFulfillmentId,
        });
        await installOrdersPostgresInsertFault('order_command_receipts');
        await expect(
          cell.execute({
            ...command('release-fulfillment-rollback'),
            fulfillmentId: rollbackFulfillmentId,
          }),
        ).rejects.toMatchObject({
          code: 'fulfillment_release_command_failed',
        });
        const [rolledBack] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orderFulfillments)
          .where(
            eq(ordersTestSchema.orderFulfillments.id, rollbackFulfillmentId),
          );
        expect(rolledBack).toMatchObject({
          releaseState: 'unreleased',
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
  operationId: 'orders.release-fulfillment.v1',
  declaration: releaseFulfillmentCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'rejects fulfillment_not_found without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder();
        const before = await releaseDurableState();
        await expect(
          releaseCell().execute({
            ...command('release-fulfillment-not-found'),
            fulfillmentId: '78000000-0000-4000-8000-000000000097',
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'fulfillment_not_found' },
        });
        expect(await releaseDurableState()).toEqual(before);
      },
    },
    {
      name: 'rejects fulfillment_transition_invalid without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const before = await releaseDurableState();
        await expect(
          releaseCell().execute(command('release-transition-invalid')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'fulfillment_transition_invalid',
          },
        });
        expect(await releaseDurableState()).toEqual(before);
      },
    },
  ],
});
