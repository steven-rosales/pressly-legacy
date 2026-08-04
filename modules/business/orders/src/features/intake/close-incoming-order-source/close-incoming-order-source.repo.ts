import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import * as orderSchema from '@pressly/db/schema/orders';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import { incomingOrderProposalInvariant } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.error.ts';
import {
  appendIncomingOrderProposalTransition,
  findExactCanonicalOrder,
  findIncomingOrderProposal,
  findIncomingOrderSourceTombstone,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.repo.ts';
import { storedIncomingOrderSourceTombstoneFromRow } from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.persistence.mapper.ts';
import type { CloseIncomingOrderSourceOperations } from './close-incoming-order-source.port.ts';
import type { CloseIncomingOrderSourceRepository } from './close-incoming-order-source.port.ts';

const closeIncomingOrderSourceOperations = (
  tx: DatabaseExecutor,
): CloseIncomingOrderSourceOperations => ({
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(tx, source, externalOrderId),
  findExactOrder: (source, externalOrderId) =>
    findExactCanonicalOrder(tx, source, externalOrderId),
  findProposal: (source, externalOrderId) =>
    findIncomingOrderProposal(tx, source, externalOrderId),
  lockProposal: (proposalId) => lockIncomingOrderProposal(tx, proposalId),
  findTombstone: (source, externalOrderId) =>
    findIncomingOrderSourceTombstone(tx, source, externalOrderId),
  createTombstone: async (command, proposalId) => {
    const [created] = await tx
      .insert(orderSchema.orderSourceTerminalTombstones)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        proposalId,
        terminalCode: command.terminalCode,
        sourceRevisionAt: command.revision.at,
        sourceRevisionHash: command.revision.hash,
        adapterVersion: command.revision.adapterVersion,
        normalizedPayload: command.revision.normalizedPayload,
        observedAt: command.revision.observedAt,
        createdAt: command.revision.observedAt,
      })
      .returning();

    if (created === undefined)
      throw incomingOrderProposalInvariant(
        'INCOMING_ORDER_TOMBSTONE_INSERT_RESULT_MISSING',
        'Incoming source tombstone insert returned no row.',
      );

    return storedIncomingOrderSourceTombstoneFromRow(created);
  },
  closeProposal: async (input) => {
    await appendIncomingOrderProposalTransition(tx, {
      proposalId: input.proposal.id,
      expectedVersion: input.proposal.version,
      transition: input.transition,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.command.context,
      reasonCode: 'source_reported_terminal',
      reasonNote: null,
      sourceTerminalCode: input.command.terminalCode,
      occurredAt: input.closedAt,
    });

    return {
      outcome: 'source_closed',
      proposalId: input.proposal.id,
      version: input.transition.version,
      canonical: null,
      replayed: false,
    };
  },
});

export const makePostgresCloseIncomingOrderSourceRepository = (
  db: Database,
): CloseIncomingOrderSourceRepository =>
  defineUnitOfWork(db, closeIncomingOrderSourceOperations);
