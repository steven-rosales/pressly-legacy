import type { JsonObject } from '@pressly/codec';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  IncomingOrderProposalCustomer,
  IncomingOrderProposalSnapshot,
} from '../../../model/incoming-order-proposal/model.ts';
import {
  findExactCanonicalOrder,
  findIncomingOrderProposal,
  findIncomingOrderSourceTombstone,
  lockIncomingOrderSource,
  type IncomingOrderProposalStoreSchema,
} from '../../../postgres/incoming-order-proposal/incoming-order-proposal.postgres.ts';
import type {
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderRepository,
  ProposeIncomingOrderTransactionRepository,
} from './types.ts';

type IncomingOrderProposalSnapshotJson = Readonly<{
  order: Omit<IncomingOrderProposalSnapshot, 'dueAt'> &
    Readonly<{ dueAt: string }>;
  source: JsonObject;
}>;

const customerDisplayName = (
  customer: IncomingOrderProposalCustomer | null,
): string | null => {
  if (customer === null) return null;
  if (customer.businessName !== null && customer.businessName.trim() !== '')
    return customer.businessName.trim();

  const name = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return name === '' ? null : name;
};

const serializeSnapshot = (
  command: ProposeIncomingOrderCommand,
): IncomingOrderProposalSnapshotJson => ({
  order: {
    ...command.snapshot,
    dueAt: command.snapshot.dueAt.toISOString(),
  },
  source: command.revision.normalizedPayload,
});

const operations = (
  transaction: PostgresExecutor,
  orders: IncomingOrderProposalStoreSchema,
): ProposeIncomingOrderTransactionRepository => ({
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(transaction, source, externalOrderId),
  findExactOrder: (source, externalOrderId) =>
    findExactCanonicalOrder(transaction, orders, source, externalOrderId),
  findTombstone: (source, externalOrderId) =>
    findIncomingOrderSourceTombstone(
      transaction,
      orders,
      source,
      externalOrderId,
    ),
  findProposal: (source, externalOrderId) =>
    findIncomingOrderProposal(transaction, orders, source, externalOrderId),
  createProposal: async (command) => {
    const customer = command.snapshot.customer;
    const [created] = await transaction
      .insert(orders.orderSourceProposals)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        locationId: command.snapshot.fulfillment.locationId,
        proposalKind: command.proposalKind,
        sourceRevisionAt: command.revision.at,
        sourceRevisionHash: command.revision.hash,
        adapterVersion: command.revision.adapterVersion,
        proposalSnapshot: serializeSnapshot(command),
        customerDisplayName: customerDisplayName(customer),
        customerPhone: customer?.phone ?? null,
        customerEmail: customer?.email ?? null,
        displayNumber: command.snapshot.displayNumber,
        dueAt: command.snapshot.dueAt,
        estimatedWeightLbs: command.snapshot.fulfillment.estimatedWeightLbs,
        observedAt: command.revision.observedAt,
        state: 'pending',
        version: 1,
        createdAt: command.revision.observedAt,
      })
      .returning({ proposalId: orders.orderSourceProposals.id });

    if (created === undefined)
      throw invariantViolationError({
        code: 'incoming_order_proposal_insert_result_missing',
        message: 'Incoming proposal insert returned no row.',
        safeMessage: 'Stored incoming order data is inconsistent.',
      });

    return created;
  },
});

export const makeProposeIncomingOrderPostgresRepository = (
  database: PostgresDatabase,
  orders: IncomingOrderProposalStoreSchema,
): ProposeIncomingOrderRepository => ({
  transaction: (work) =>
    database.transaction((transaction) =>
      work(operations(transaction, orders)),
    ),
});
