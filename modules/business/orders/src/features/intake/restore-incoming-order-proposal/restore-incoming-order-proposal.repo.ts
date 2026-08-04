import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  appendIncomingOrderProposalTransition,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalTransitionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.repo.ts';
import type {
  RestoreIncomingOrderProposalOperations,
  RestoreIncomingOrderProposalRepository,
} from './restore-incoming-order-proposal.port.ts';

const restoreIncomingOrderProposalOperations = (
  tx: DatabaseExecutor,
): RestoreIncomingOrderProposalOperations => ({
  lockCommand: (idempotencyKey) => lockIncomingOrderCommand(tx, idempotencyKey),
  loadTransitionByIdempotencyKey: (idempotencyKey) =>
    loadIncomingOrderProposalTransitionByIdempotencyKey(tx, idempotencyKey),
  loadProposal: (proposalId) => loadIncomingOrderProposal(tx, proposalId),
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(tx, source, externalOrderId),
  lockProposal: (proposalId) => lockIncomingOrderProposal(tx, proposalId),
  restoreProposal: async (input) => {
    await appendIncomingOrderProposalTransition(tx, {
      proposalId: input.proposal.id,
      expectedVersion: input.proposal.version,
      transition: input.transition,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      sourceTerminalCode: null,
      occurredAt: input.restoredAt,
    });

    return {
      proposalId: input.proposal.id,
      state: 'restored_pending',
      version: input.transition.version,
      replayed: false,
    };
  },
});

export const makePostgresRestoreIncomingOrderProposalRepository = (
  db: Database,
): RestoreIncomingOrderProposalRepository =>
  defineUnitOfWork(db, restoreIncomingOrderProposalOperations);
