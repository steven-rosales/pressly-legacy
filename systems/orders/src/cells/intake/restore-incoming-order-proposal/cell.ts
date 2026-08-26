import { defineOperation } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { restoreIncomingOrderProposalContract } from './contract.ts';
import { makeExecuteRestoreIncomingOrderProposal } from './execute.ts';
import { restoreIncomingOrderProposalHttpSurfaces } from './http.ts';
import { makeRestoreIncomingOrderProposalPostgresWriter } from './postgres.ts';
import type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalExpectedFailure,
  RestoreIncomingOrderProposalResult,
} from './types.ts';

export const restoreIncomingOrderProposalOperationId =
  'orders.restore-incoming-order-proposal.v1';

export const restoreIncomingOrderProposalCellDeclaration = defineOperation<
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalResult,
  RestoreIncomingOrderProposalExpectedFailure
>({
  kind: 'command',
  id: restoreIncomingOrderProposalOperationId,
  authentication: 'required',
  contract: restoreIncomingOrderProposalContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.proposalId,
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: restoreIncomingOrderProposalHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'orders.restore_incoming_order_proposal' },
});

export const makeRestoreIncomingOrderProposalCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  defineOperation(
    restoreIncomingOrderProposalCellDeclaration,
    makeExecuteRestoreIncomingOrderProposal({
      writer: makeRestoreIncomingOrderProposalPostgresWriter(dependencies),
    }),
  );
