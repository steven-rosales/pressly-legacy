import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationId,
  ordersPostgresProofNow,
  removeOrdersPostgresInsertFault,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';
import {
  makeProposeIncomingOrderCell,
  proposeIncomingOrderCellDeclaration,
} from './cell.ts';
import { makeProposeIncomingOrderPostgresRepository } from './postgres.ts';
import type { ProposeIncomingOrderCommand } from './types.ts';

useOrdersPostgresProof('propose-incoming-order');

const command = (externalOrderId: string): ProposeIncomingOrderCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId,
  proposalKind: 'submitted_order',
  snapshot: {
    customer: {
      externalUserId: 'customer-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      businessName: '  Analytical Laundry  ',
      phone: '+12125550100',
      email: 'ada@example.test',
      normalizedPayload: { id: 'customer-1', kind: 'business' },
    },
    displayNumber: `P-${externalOrderId}`,
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    currency: 'USD',
    totalAmountCents: 3_600,
    balanceDueCents: 3_600,
    items: [
      {
        lineKey: 'laundry',
        itemType: 'service',
        code: 'wash_fold',
        description: 'Wash and fold',
        quantity: 18,
        unit: 'lb',
        unitPriceCents: 200,
        totalAmountCents: 3_600,
        sourceMetadata: { service: 'wash_fold' },
      },
    ],
    fulfillment: {
      typeCode: 'wash_fold',
      locationId: ordersPostgresProofLocationId,
      estimatedWeightLbs: 18,
      estimatedWeightSource: 'source_estimate',
    },
  },
  revision: {
    at: new Date('2026-08-22T15:59:00.000Z'),
    hash: 'a'.repeat(64),
    adapterVersion: 'orders-local-proof-v1',
    observedAt: ordersPostgresProofNow,
    normalizedPayload: { order: { id: externalOrderId, state: 'SUBMITTED' } },
  },
});

const execute = (value: ProposeIncomingOrderCommand) =>
  makeProposeIncomingOrderCell({
    repo: makeProposeIncomingOrderPostgresRepository(
      ordersPostgresProofDatabase.db,
      ordersTestSchema,
    ),
  }).execute(value);

const successfulValue = async (value: ProposeIncomingOrderCommand) => {
  const outcome = await execute(value);
  expect(outcome.kind).toBe('success');
  if (outcome.kind !== 'success') return null as never;
  return outcome.value;
};

proveOperation({
  operationId: 'orders.propose-incoming-order.v1',
  declaration: proposeIncomingOrderCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one exact immutable incoming Order proposal',
      proves: ['postgres-commit'],
      run: async () => {
        const input = command('propose-commit');
        const result = await successfulValue(input);
        expect(result).toMatchObject({
          proposalId: expect.stringMatching(/^[a-f0-9-]{36}$/),
          version: 1,
          replayed: false,
          outcome: 'proposed',
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toMatchObject([
          {
            id: result.proposalId,
            source: 'cents',
            externalOrderId: 'propose-commit',
            customerDisplayName: 'Analytical Laundry',
            state: 'pending',
            version: 1,
            proposalSnapshot: {
              order: {
                ...input.snapshot,
                dueAt: input.snapshot.dueAt.toISOString(),
              },
              source: input.revision.normalizedPayload,
            },
          },
        ]);
      },
    },
    {
      name: 'replays the same source observation with its stable proposal identity',
      proves: ['same-payload-replay'],
      run: async () => {
        const input = command('propose-replay');
        const first = await successfulValue(input);
        await expect(successfulValue(input)).resolves.toEqual({
          proposalId: first.proposalId,
          version: 1,
          replayed: true,
          outcome: 'existing_proposal',
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toHaveLength(1);
      },
    },
    {
      name: 'serializes concurrent proposals for the same source identity to one row',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const input = command('propose-concurrent');
        const values = await Promise.all([
          successfulValue(input),
          successfulValue(input),
        ]);
        expect(values.map(({ outcome }) => outcome).sort()).toEqual([
          'existing_proposal',
          'proposed',
        ]);
        expect(new Set(values.map(({ proposalId }) => proposalId)).size).toBe(
          1,
        );
      },
    },
    {
      name: 'rejects a late proposal after terminal source evidence without a partial write',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const input = command('propose-after-terminal');
        await ordersPostgresProofDatabase.db
          .insert(ordersTestSchema.orderSourceTerminalTombstones)
          .values({
            source: input.source,
            externalOrderId: input.externalOrderId,
            proposalId: null,
            terminalCode: 'canceled',
            sourceRevisionAt: ordersPostgresProofNow,
            sourceRevisionHash: 'b'.repeat(64),
            adapterVersion: 'orders-local-proof-v1',
            normalizedPayload: { order: { state: 'canceled' } },
            observedAt: ordersPostgresProofNow,
            createdAt: ordersPostgresProofNow,
          });
        await expect(successfulValue(input)).resolves.toMatchObject({
          outcome: 'source_closed',
          replayed: true,
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toEqual([]);
      },
    },
    {
      name: 'preserves the canonical Order as the single writer when its source link already exists',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const input = command('propose-after-canonical');
        const canonical = await seedOrdersPostgresCanonicalOrder();
        await ordersPostgresProofDatabase.db
          .insert(ordersTestSchema.orderSourceLinks)
          .values({
            source: input.source,
            externalOrderId: input.externalOrderId,
            orderId: canonical.orderId,
            createdAt: ordersPostgresProofNow,
            updatedAt: ordersPostgresProofNow,
          });
        await expect(successfulValue(input)).resolves.toMatchObject({
          outcome: 'existing_order',
          replayed: true,
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toEqual([]);
      },
    },
    {
      name: 'rolls back a failed proposal insert without durable residue',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await installOrdersPostgresInsertFault('order_source_proposals');
        try {
          await expect(
            execute(command('propose-rollback')),
          ).rejects.toMatchObject({
            kind: 'DatabaseError',
            code: 'incoming_order_proposal_failed',
          });
        } finally {
          await removeOrdersPostgresInsertFault();
        }
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toEqual([]);
      },
    },
  ],
});
