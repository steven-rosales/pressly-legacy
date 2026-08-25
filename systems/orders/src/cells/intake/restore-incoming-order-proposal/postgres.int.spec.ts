import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makeRestoreIncomingOrderProposalCell,
  restoreIncomingOrderProposalCellDeclaration,
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

useOrdersPostgresProof('restore-incoming-order-proposal');

const command = (
  proposalId: string,
  idempotencyKey: string,
  reasonNote: string | null = null,
) => ({
  proposalId,
  locationId: ordersPostgresProofLocationId,
  expectedVersion: 2,
  idempotencyKey,
  context: ordersPostgresProofContext,
  reasonCode: 'source_closure_overridden' as const,
  reasonNote,
});

const restoreCell = () =>
  makeRestoreIncomingOrderProposalCell({
    db: ordersPostgresProofDatabase.db,
    schema: ordersTestSchema,
    clock: ordersPostgresProofClock,
  });

const restorationDurableState = async () => ({
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
  operationId: 'orders.restore-incoming-order-proposal.v1',
  declaration: restoreIncomingOrderProposalCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'serializes restoration replay, rejects divergent and decided commands, and rolls back proposal state and transition together',
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
          externalOrderId: 'restore-local-proof',
          state: 'source_closed',
          version: 2,
        });
        const cell = restoreCell();
        const firstCommand = command(proposal.id, 'restore-proposal-1');
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
          .from(ordersTestSchema.orderSourceProposals)
          .where(eq(ordersTestSchema.orderSourceProposals.id, proposal.id));
        expect(stored).toMatchObject({ state: 'restored_pending', version: 3 });
        await expect(
          cell.execute(command(proposal.id, 'restore-proposal-1', 'divergent')),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'order_idempotency_conflict' },
        });
        await expect(
          cell.execute({
            ...command(proposal.id, 'restore-proposal-decided'),
            expectedVersion: 3,
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'incoming_order_proposal_transition_invalid' },
        });

        const rollbackProposal = await seedOrdersPostgresProposal({
          externalOrderId: 'restore-local-proof-rollback',
          state: 'source_closed',
          version: 2,
        });
        await installOrdersPostgresInsertFault(
          'order_source_proposal_transitions',
        );
        await expect(
          cell.execute(
            command(rollbackProposal.id, 'restore-proposal-rollback'),
          ),
        ).rejects.toMatchObject({
          code: 'incoming_order_proposal_restore_failed',
        });
        const [preserved] = await ordersPostgresProofDatabase.db
          .select()
          .from(ordersTestSchema.orderSourceProposals)
          .where(
            eq(ordersTestSchema.orderSourceProposals.id, rollbackProposal.id),
          );
        expect(preserved).toMatchObject({ state: 'source_closed', version: 2 });
      },
    },
    {
      name: 'returns the exact restore-invalid failure without changing durable proposal state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'restore-invalid-proof',
          state: 'source_closed',
          version: 2,
        });
        const before = await restorationDurableState();
        await expect(
          restoreCell().execute({
            ...command(proposal.id, 'restore-invalid-proof'),
            expectedVersion: 0,
          }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'incoming_order_proposal_restore_invalid',
            message: 'The incoming Order restore command is incomplete.',
          },
        });
        await expect(restorationDurableState()).resolves.toEqual(before);
      },
    },
    {
      name: 'returns the exact proposal-not-found failure without writing a restoration',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const before = await restorationDurableState();
        await expect(
          restoreCell().execute(
            command(
              '78000000-0000-4000-8000-000000000992',
              'restore-not-found-proof',
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
        await expect(restorationDurableState()).resolves.toEqual(before);
      },
    },
    {
      name: 'returns the exact proposal-version conflict without changing proposal state',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        const proposal = await seedOrdersPostgresProposal({
          externalOrderId: 'restore-version-conflict-proof',
          state: 'source_closed',
          version: 3,
        });
        const before = await restorationDurableState();
        await expect(
          restoreCell().execute(
            command(proposal.id, 'restore-version-conflict-proof'),
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
        await expect(restorationDurableState()).resolves.toEqual(before);
      },
    },
  ],
});
