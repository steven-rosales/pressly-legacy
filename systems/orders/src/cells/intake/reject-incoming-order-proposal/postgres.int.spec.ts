import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makeRejectIncomingOrderProposalCell,
  rejectIncomingOrderProposalCellDeclaration,
} from './cell.ts';
import {
  installOrdersPostgresInsertFault,
  ordersPostgresProofClock,
  ordersPostgresProofContext,
  ordersPostgresProofDatabase,
  ordersPostgresProofLocationId,
  seedOrdersPostgresProposal,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('reject-incoming-order-proposal');

const command = (
  proposalId: string,
  idempotencyKey: string,
  reasonNote: string | null = null,
) => ({
  proposalId,
  locationId: ordersPostgresProofLocationId,
  expectedVersion: 1,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'duplicate_order' as const,
  reasonNote,
});

const rejectCell = () =>
  makeRejectIncomingOrderProposalCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
  });

const rejectionDurableState = async () => ({
  proposals: await ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orderSourceProposals),
  transitions: await ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orderSourceProposalTransitions),
  resolutions: await ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orderSourceProposalResolutions),
  tombstones: await ordersPostgresProofDatabase.db
    .select()
    .from(ordersTestSchema.orderSourceTerminalTombstones),
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
});

proveOperation({
  operationId: 'orders.reject-incoming-order-proposal.v1',
  declaration: rejectIncomingOrderProposalCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes rejection replay, rejects divergent and decided commands, and rolls back proposal transition and resolution together',
      proves: [
        'postgres-commit',
        'expected-rejection-no-partial-write',
        'unexpected-failure-rollback',
        'same-payload-replay',
        'divergent-key-conflict',
        'same-key-concurrency',
        'declared-concurrency-race',
      ],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'reject-local-proof',
        });
        const cell = rejectCell();
        const firstCommand = command(proposal.id, 'reject-proposal-1');
        const outcomes = await Promise.all([
          cell.execute(firstCommand),
          cell.execute(firstCommand),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.replayed : null,
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalResolutions),
        ).resolves.toHaveLength(1);
        await expect(
          ordersPostgresProofDatabase.db.select().from(ordersTestSchema.orders),
        ).resolves.toHaveLength(0);

        await expect(
          cell.execute(command(proposal.id, 'reject-proposal-1', 'divergent')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute(command(proposal.id, 'reject-proposal-decided')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'incoming_order_proposal_transition_invalid' },
        });

        const rollbackProposal = await seedOrdersPostgresProposal({
          externalOrderId: 'reject-local-proof-rollback',
        });
        await installOrdersPostgresInsertFault(
          'order_source_proposal_resolutions',
        );
        await expect(
          cell.execute(
            command(rollbackProposal.id, 'reject-proposal-rollback'),
          ),
        ).rejects.toMatchObject({
          code: 'incoming_order_proposal_reject_failed',
        });
        const [preserved] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orderSourceProposals)
          .where(
            eq(ordersTestSchema.orderSourceProposals.id, rollbackProposal.id),
          );
        expect(preserved).toMatchObject({ state: 'pending', version: 1 });
        await expect(
          ordersPostgresProofDatabase.db
            .select()
            .from(ordersTestSchema.orderSourceProposalResolutions),
        ).resolves.toHaveLength(1);
      },
    },
    {
      name: 'returns the exact reject-invalid failure without changing durable proposal state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'reject-invalid-proof',
        });
        const before = await rejectionDurableState();
        await expect(
          rejectCell().execute({
            ...command(proposal.id, 'reject-invalid-proof'),
            expectedVersion: 0,
          }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'incoming_order_proposal_reject_invalid',
            message: 'The incoming Order rejection is incomplete.',
          },
        });
        await expect(rejectionDurableState()).resolves.toEqual(before);
      },
    },
    {
      name: 'returns the exact proposal-not-found failure without writing a rejection',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const before = await rejectionDurableState();
        await expect(
          rejectCell().execute(
            command(
              '78000000-0000-4000-8000-000000000991',
              'reject-not-found-proof',
            ),
          ),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'not_found',
            code: 'incoming_order_proposal_not_found',
            message: 'The incoming Order proposal was not found.',
          },
        });
        await expect(rejectionDurableState()).resolves.toEqual(before);
      },
    },
    {
      name: 'returns the exact proposal-version conflict without changing proposal state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'reject-version-conflict-proof',
          version: 2,
        });
        const before = await rejectionDurableState();
        await expect(
          rejectCell().execute(
            command(proposal.id, 'reject-version-conflict-proof'),
          ),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'incoming_order_proposal_version_conflict',
            message:
              'The incoming Order proposal changed after this request was prepared.',
          },
        });
        await expect(rejectionDurableState()).resolves.toEqual(before);
      },
    },
  ],
});
