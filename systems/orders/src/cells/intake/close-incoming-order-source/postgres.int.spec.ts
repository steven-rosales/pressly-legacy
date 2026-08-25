import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofClock,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationId,
  ordersPostgresProofNow,
  removeOrdersPostgresInsertFault,
  seedOrdersPostgresCanonicalOrder,
  seedOrdersPostgresProposal,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';
import {
  closeIncomingOrderSourceCellDeclaration,
  makeCloseIncomingOrderSourceCell,
} from './cell.ts';
import { closeIncomingOrderSourceCommandHash } from './execute.ts';
import { makeCloseIncomingOrderSourcePostgresRepository } from './postgres.ts';
import type { CloseIncomingOrderSourceCommand } from './types.ts';

useOrdersPostgresProof('close-incoming-order-source');

const command = (
  externalOrderId: string,
  terminalCode: 'completed' | 'canceled' = 'completed',
): CloseIncomingOrderSourceCommand => ({
  context: {
    origin: 'external_orders_adapter',
    principal: { kind: 'system', id: 'external-orders' },
  },
  source: 'cents',
  externalOrderId,
  terminalCode,
  revision: {
    at: new Date('2026-08-22T16:05:00.000Z'),
    hash: 'b'.repeat(64),
    adapterVersion: 'orders-local-proof-v1',
    observedAt: new Date('2026-08-22T16:05:01.000Z'),
    normalizedPayload: { order: { id: externalOrderId, state: terminalCode } },
  },
});

const execute = (value: CloseIncomingOrderSourceCommand) =>
  makeCloseIncomingOrderSourceCell({
    clock: ordersPostgresProofClock,
    repo: makeCloseIncomingOrderSourcePostgresRepository(
      ordersPostgresProofDatabase.db,
      ordersTestSchema,
    ),
  }).execute(value);

const successfulValue = async (value: CloseIncomingOrderSourceCommand) => {
  const outcome = await execute(value);
  expect(outcome.kind).toBe('success');
  if (outcome.kind !== 'success') return null as never;
  return outcome.value;
};

proveOperation({
  operationId: 'orders.close-incoming-order-source.v1',
  declaration: closeIncomingOrderSourceCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits terminal evidence, proposal state and the exact transition atomically',
      proves: ['postgres-commit'],
      run: async () => {
        const input = command('close-commit');
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: input.externalOrderId,
        });
        await expect(successfulValue(input)).resolves.toEqual({
          outcome: 'source_closed',
          proposalId: proposal.id,
          version: 2,
          canonical: null,
          replayed: false,
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toMatchObject([
          { id: proposal.id, state: 'source_closed', version: 2 },
        ]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceTerminalTombstones),
        ).toMatchObject([
          {
            proposalId: proposal.id,
            terminalCode: 'completed',
            sourceRevisionHash: input.revision.hash,
            normalizedPayload: input.revision.normalizedPayload,
          },
        ]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toMatchObject([
          {
            proposalId: proposal.id,
            fromState: 'pending',
            toState: 'source_closed',
            eventType: 'source_close',
            proposalVersion: 2,
            idempotencyKey: `incoming-order-source-close:cents:${input.externalOrderId}:${'b'.repeat(64)}`,
            commandHash: closeIncomingOrderSourceCommandHash(input),
            reasonCode: 'source_reported_terminal',
            sourceTerminalCode: 'completed',
            occurredAt: ordersPostgresProofNow,
          },
        ]);
      },
    },
    {
      name: 'replays identical terminal evidence without a second transition',
      proves: ['same-payload-replay'],
      run: async () => {
        const input = command('close-replay');
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: input.externalOrderId,
        });
        await successfulValue(input);
        await expect(successfulValue(input)).resolves.toMatchObject({
          outcome: 'already_source_closed',
          proposalId: proposal.id,
          version: 2,
          replayed: true,
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toHaveLength(1);
      },
    },
    {
      name: 'rejects divergent terminal evidence that reuses the same source revision key',
      proves: ['divergent-key-conflict'],
      run: async () => {
        const accepted = command('close-divergent');
        await seedOrdersPostgresProposal({
          externalOrderId: accepted.externalOrderId,
        });
        await successfulValue(accepted);
        await expect(
          execute(command(accepted.externalOrderId, 'canceled')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceTerminalTombstones),
        ).toMatchObject([{ terminalCode: 'completed' }]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toHaveLength(1);
      },
    },
    {
      name: 'serializes concurrent terminal observations for one source identity',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const input = command('close-concurrent');
        await seedOrdersPostgresProposal({
          externalOrderId: input.externalOrderId,
        });
        const values = await Promise.all([
          successfulValue(input),
          successfulValue(input),
        ]);
        expect(values.map(({ outcome }) => outcome).sort()).toEqual([
          'already_source_closed',
          'source_closed',
        ]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toHaveLength(1);
      },
    },
    {
      name: 'commits and replays a tombstone when terminal evidence arrives before a proposal',
      proves: ['postgres-commit', 'same-payload-replay'],
      run: async () => {
        const input = command('close-before-proposal', 'canceled');
        await expect(successfulValue(input)).resolves.toMatchObject({
          outcome: 'tombstoned',
          proposalId: null,
          replayed: false,
        });
        await expect(successfulValue(input)).resolves.toMatchObject({
          outcome: 'tombstoned',
          proposalId: null,
          replayed: true,
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceTerminalTombstones),
        ).toMatchObject([
          {
            externalOrderId: input.externalOrderId,
            proposalId: null,
            terminalCode: 'canceled',
          },
        ]);
      },
    },
    {
      name: 'keeps an existing canonical Order authoritative without a proposal transition',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const input = command('close-canonical');
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: input.externalOrderId,
        });
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
          proposalId: proposal.id,
          version: 1,
          canonical: {
            orderId: canonical.orderId,
            fulfillmentId: canonical.fulfillmentId,
          },
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toEqual([]);
      },
    },
    {
      name: 'rolls back tombstone and proposal state when transition persistence fails',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const input = command('close-rollback');
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: input.externalOrderId,
        });
        await installOrdersPostgresInsertFault(
          'order_source_proposal_transitions',
        );
        try {
          await expect(execute(input)).rejects.toMatchObject({
            kind: 'DatabaseError',
            code: 'incoming_order_source_close_failed',
          });
        } finally {
          await removeOrdersPostgresInsertFault();
        }
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposals),
        ).toMatchObject([{ id: proposal.id, state: 'pending', version: 1 }]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceTerminalTombstones),
        ).toEqual([]);
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalTransitions),
        ).toEqual([]);
      },
    },
    {
      name: 'fails before writing terminal evidence when the stored proposal snapshot is corrupt',
      proves: ['unexpected-failure-no-write'],
      run: async () => {
        const input = command('close-corrupt');
        await ordersPostgresProofDatabase.db
          .insert(ordersTestSchema.orderSourceProposals)
          .values({
            id: '78000000-0000-4000-8000-000000000099',
            source: input.source,
            externalOrderId: input.externalOrderId,
            locationId: ordersPostgresProofLocationId,
            proposalKind: 'submitted_order',
            sourceRevisionAt: new Date('2026-08-22T15:59:00.000Z'),
            sourceRevisionHash: 'a'.repeat(64),
            adapterVersion: 'orders-local-proof-v1',
            proposalSnapshot: {},
            dueAt: new Date('2026-08-23T20:00:00.000Z'),
            observedAt: ordersPostgresProofNow,
            state: 'pending',
            version: 1,
            createdAt: ordersPostgresProofNow,
          });
        await expect(execute(input)).rejects.toMatchObject({
          kind: 'InvariantViolationError',
          code: 'incoming_order_proposal_snapshot_invalid',
        });
        expect(
          await ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceTerminalTombstones),
        ).toEqual([]);
      },
    },
  ],
});
