import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import * as orderSchema from '@pressly/db/schema/orders';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import { incomingOrderProposalInvariant } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.error.ts';
import {
  findExactCanonicalOrder,
  findIncomingOrderProposal,
  findIncomingOrderSourceTombstone,
  lockIncomingOrderSource,
} from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.repo.ts';
import {
  incomingOrderProposalCustomerDisplayName,
  serializeIncomingOrderProposalSnapshot,
} from './propose-incoming-order.persistence.mapper.ts';
import type { ProposeIncomingOrderOperations } from './propose-incoming-order.port.ts';
import type { ProposeIncomingOrderRepository } from './propose-incoming-order.port.ts';

const proposeIncomingOrderOperations = (
  tx: DatabaseExecutor,
): ProposeIncomingOrderOperations => ({
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(tx, source, externalOrderId),
  findExactOrder: (source, externalOrderId) =>
    findExactCanonicalOrder(tx, source, externalOrderId),
  findTombstone: (source, externalOrderId) =>
    findIncomingOrderSourceTombstone(tx, source, externalOrderId),
  findProposal: (source, externalOrderId) =>
    findIncomingOrderProposal(tx, source, externalOrderId),
  createProposal: async (command) => {
    const customer = command.snapshot.customer;
    const [created] = await tx
      .insert(orderSchema.orderSourceProposals)
      .values({
        source: command.source,
        externalOrderId: command.externalOrderId,
        locationId: command.snapshot.fulfillment.locationId,
        proposalKind: command.proposalKind,
        sourceRevisionAt: command.revision.at,
        sourceRevisionHash: command.revision.hash,
        adapterVersion: command.revision.adapterVersion,
        proposalSnapshot: serializeIncomingOrderProposalSnapshot(command),
        customerDisplayName: incomingOrderProposalCustomerDisplayName(customer),
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
      .returning({ proposalId: orderSchema.orderSourceProposals.id });

    if (created === undefined)
      throw incomingOrderProposalInvariant(
        'INCOMING_ORDER_PROPOSAL_INSERT_RESULT_MISSING',
        'Incoming proposal insert returned no row.',
      );

    return created;
  },
});

export const makePostgresProposeIncomingOrderRepository = (
  db: Database,
): ProposeIncomingOrderRepository =>
  defineUnitOfWork(db, proposeIncomingOrderOperations);
