import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  appendIncomingOrderProposalTransition,
  insertIncomingOrderProposalResolution,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalResolutionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.repo.ts';
import { loadOrderCommandReceipt } from '../../../foundations/adapters/postgres/order-store/order-store.repo.ts';
import type {
  RejectIncomingOrderProposalOperations,
  RejectIncomingOrderProposalRepository,
} from './reject-incoming-order-proposal.port.ts';

const rejectIncomingOrderProposalOperations = (
  tx: DatabaseExecutor,
): RejectIncomingOrderProposalOperations => ({
  lockCommand: (idempotencyKey) => lockIncomingOrderCommand(tx, idempotencyKey),
  loadResolutionByIdempotencyKey: (idempotencyKey) =>
    loadIncomingOrderProposalResolutionByIdempotencyKey(tx, idempotencyKey),
  loadCanonicalOrderCommandReceipt: (idempotencyKey) =>
    loadOrderCommandReceipt(tx, idempotencyKey),
  loadProposal: (proposalId) => loadIncomingOrderProposal(tx, proposalId),
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(tx, source, externalOrderId),
  lockProposal: (proposalId) => lockIncomingOrderProposal(tx, proposalId),
  rejectProposal: async (input) => {
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
      occurredAt: input.decidedAt,
    });
    await insertIncomingOrderProposalResolution(tx, {
      proposalId: input.proposal.id,
      decision: 'rejected',
      proposalVersion: input.transition.version,
      orderId: null,
      fulfillmentId: null,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      decidedAt: input.decidedAt,
    });
  },
});

export const makePostgresRejectIncomingOrderProposalRepository = (
  db: Database,
): RejectIncomingOrderProposalRepository =>
  defineUnitOfWork(db, rejectIncomingOrderProposalOperations);
