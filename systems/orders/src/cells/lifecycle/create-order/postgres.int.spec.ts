import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { createOrderCellDeclaration, makeCreateOrderCell } from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofBusinessId,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofCustomerReference,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationFacts,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('create-order');

const command = (idempotencyKey: string, displayNumber = 'P-CREATE') => ({
  businessId: ordersPostgresProofBusinessId,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'new_customer_order' as const,
  reasonNote: null,
  customer: {
    resolution: 'not_provided' as const,
    userId: null,
    externalUserId: null,
  },
  displayNumber,
  dueAt: new Date('2026-08-23T20:00:00.000Z'),
  currency: 'USD',
  totalAmountCents: 3_600,
  balanceDueCents: 3_600,
  items: [],
  fulfillment: {
    typeCode: 'wash_fold',
    locationId: 'orders-local-proof-location',
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
  },
});

const createCell = () =>
  makeCreateOrderCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
    customerReferenceV1: ordersPostgresProofCustomerReference,
    orderLocationFactsV1: ordersPostgresProofLocationFacts,
  });

proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes creation replay, rejects divergent reuse, and rolls back Order, fulfillment, receipt and outbox together',
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
        const cell = createCell();
        const firstCommand = command('create-order-1');
        const outcomes = await Promise.all([
          cell.execute(firstCommand),
          cell.execute(firstCommand),
        ]);
        expect(outcomes.map(({ kind }) => kind)).toEqual([
          'success',
          'success',
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderFulfillments),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderCommandReceipts),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        ).resolves.toHaveLength(1);

        await expect(
          cell.execute(command('create-order-1', 'P-DIVERGENT')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });

        const rejected = makeCreateOrderCell({
          db: ordersPostgresProofDatabase.db,
          schema: ordersTestSchema,
          clock: ordersPostgresProofClock,
          customerReferenceV1: ordersPostgresProofCustomerReference,
          orderLocationFactsV1: {
            execute: async () => null,
          } as never,
        });
        await expect(
          rejected.execute(command('create-order-reference-missing')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_reference_not_found' },
        });
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(1);

        await installOrdersPostgresInsertFault('order_command_receipts');
        await expect(
          cell.execute(command('create-order-rollback', 'P-ROLLBACK')),
        ).rejects.toMatchObject({ code: 'order_create_failed' });
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        ).resolves.toHaveLength(1);
      },
    },
  ],
});

proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'rejects order_create_invalid before persistence without partial durable state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const before = {
          orders: await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orders),
          fulfillments: await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderFulfillments),
          receipts: await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderCommandReceipts),
          outbox: await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderOutboxEvents),
        };
        await expect(
          createCell().execute({
            ...command('create-order-invalid'),
            totalAmountCents: -1,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'validation', code: 'order_create_invalid' },
        });
        await expect(
          Promise.all([
            ordersPostgresProofDatabase.db
              .select()
              .from(ordersTestSchema.orders),
            ordersPostgresProofDatabase.db
              .select()
              .from(ordersTestSchema.orderFulfillments),
            ordersPostgresProofDatabase.db
              .select()
              .from(ordersTestSchema.orderCommandReceipts),
            ordersPostgresProofDatabase.db
              .select()
              .from(ordersTestSchema.orderOutboxEvents),
          ]),
        ).resolves.toEqual([
          before.orders,
          before.fulfillments,
          before.receipts,
          before.outbox,
        ]);
      },
    },
  ],
});
