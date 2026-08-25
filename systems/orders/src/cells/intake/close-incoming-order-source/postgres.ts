import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  appendIncomingOrderProposalTransition,
  findExactCanonicalOrder,
  findIncomingOrderProposal,
  findIncomingOrderSourceTombstone,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
  type IncomingOrderProposalStoreSchema,
} from '../../../postgres/incoming-order-proposal/incoming-order-proposal.postgres.ts';
import { storedIncomingOrderSourceTombstoneFromRow } from '../../../postgres/incoming-order-proposal/stored-proposal.postgres.ts';
import type {
  CloseIncomingOrderSourceRepository,
  CloseIncomingOrderSourceTransactionRepository,
} from './types.ts';

const operations = (
  transaction: PostgresExecutor,
  orders: IncomingOrderProposalStoreSchema,
): CloseIncomingOrderSourceTransactionRepository => ({
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(transaction, source, externalOrderId),
  findExactOrder: (source, externalOrderId) =>
    findExactCanonicalOrder(transaction, orders, source, externalOrderId),
  findProposal: (source, externalOrderId) =>
    findIncomingOrderProposal(transaction, orders, source, externalOrderId),
  lockProposal: (proposalId) =>
    lockIncomingOrderProposal(transaction, orders, proposalId),
  findTombstone: (source, externalOrderId) =>
    findIncomingOrderSourceTombstone(
      transaction,
      orders,
      source,
      externalOrderId,
    ),
  createTombstone: async (command, proposalId) => {
    const [created] = await transaction
      .insert(orders.orderSourceTerminalTombstones)
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
      throw invariantViolationError({
        code: 'incoming_order_tombstone_insert_result_missing',
        message: 'Incoming source tombstone insert returned no row.',
        safeMessage: 'Stored incoming order data is inconsistent.',
      });

    return storedIncomingOrderSourceTombstoneFromRow(created);
  },
  closeProposal: async (input) => {
    await appendIncomingOrderProposalTransition(transaction, orders, {
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

export const makeCloseIncomingOrderSourcePostgresRepository = (
  database: PostgresDatabase,
  orders: IncomingOrderProposalStoreSchema,
): CloseIncomingOrderSourceRepository => ({
  transaction: (work) =>
    database.transaction((transaction) =>
      work(operations(transaction, orders)),
    ),
});
