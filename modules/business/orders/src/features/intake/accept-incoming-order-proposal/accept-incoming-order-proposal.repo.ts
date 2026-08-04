import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as businessSchema from '@pressly/db/schema/business';
import * as orderSchema from '@pressly/db/schema/orders';
import { defineResultUnitOfWork } from '@pressly/db/unit-of-work';
import { result, type Result } from '@pressly/kernel';
import {
  appendIncomingOrderProposalTransition,
  findExactCanonicalOrder,
  insertIncomingOrderProposalResolution,
  loadIncomingOrderProposal,
  loadIncomingOrderProposalResolutionByIdempotencyKey,
  lockIncomingOrderCommand,
  lockIncomingOrderProposal,
  lockIncomingOrderSource,
} from '../../../foundations/adapters/postgres/incoming-order-proposal-store/incoming-order-proposal-store.repo.ts';
import { incomingOrderProposalInvariant } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.error.ts';
import type { IncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type {
  OrderCustomer,
  OrderInput,
} from '../../../foundations/language/order/order.model.ts';
import {
  createStoredPresslyOrder,
  loadOrderCommandReceipt,
  saveOrderCommandReceipt,
} from '../../../foundations/adapters/postgres/order-store/order-store.repo.ts';
import type {
  AcceptIncomingOrderProposalOperations,
  AcceptIncomingOrderProposalRepository,
} from './accept-incoming-order-proposal.port.ts';
import type { ResolveIncomingOrderProposalCustomerInput } from './accept-incoming-order-proposal.model.ts';
import type { IncomingOrderProposalCustomerFailure } from './accept-incoming-order-proposal.failure.ts';

/**
 * Persistence composition seam for a customer resolver that must participate
 * in the same database transaction as proposal acceptance.
 */
export type IncomingOrderProposalCustomerPersistence = Readonly<{
  resolveOrCreate: (
    db: DatabaseExecutor,
    input: ResolveIncomingOrderProposalCustomerInput,
  ) => Promise<
    Result<
      Readonly<{ userId: string; created: boolean }>,
      IncomingOrderProposalCustomerFailure
    >
  >;
}>;

const businessIdForLocation = async (
  tx: DatabaseExecutor,
  locationId: string,
): Promise<string> => {
  const [location] = await tx
    .select({ businessId: businessSchema.productionLocations.businessId })
    .from(businessSchema.productionLocations)
    .where(eq(businessSchema.productionLocations.id, locationId))
    .limit(1);

  if (location === undefined)
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_LOCATION_ANCESTRY_MISSING',
      'Incoming Order proposal location has no authoritative business ancestry.',
    );

  return location.businessId;
};

const resolveOrCreateExactCustomer = async (
  tx: DatabaseExecutor,
  persistence: IncomingOrderProposalCustomerPersistence,
  proposal: IncomingOrderProposal,
  context: Readonly<{
    origin: string;
    principal: Readonly<{
      kind: 'human' | 'service' | 'system';
      id: string;
    }>;
  }>,
  now: Date,
): Promise<Result<OrderCustomer, IncomingOrderProposalCustomerFailure>> => {
  const customer = proposal.snapshot.customer;
  if (customer === null)
    return result.ok({
      resolution: 'not_provided',
      userId: null,
      externalUserId: null,
    });

  const businessId = await businessIdForLocation(tx, proposal.locationId);
  const resolved = await persistence.resolveOrCreate(tx, {
    businessId,
    source: proposal.source,
    externalUserId: customer.externalUserId,
    profile: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      businessName: customer.businessName,
      phone: customer.phone,
      email: customer.email,
    },
    revision: {
      at: proposal.sourceRevisionAt,
      hash: proposal.sourceRevisionHash,
      adapterVersion: proposal.adapterVersion,
      observedAt: proposal.observedAt,
      normalizedPayload: customer.normalizedPayload,
    },
    idempotencyKey: `incoming-order-proposal:${proposal.id}:customer`,
    context,
    now,
  });

  if (result.isErr(resolved)) return resolved;

  return result.ok({
    resolution: 'resolved',
    userId: resolved.value.userId,
    externalUserId: customer.externalUserId,
  });
};

const acceptIncomingOrderProposalOperations = (
  tx: DatabaseExecutor,
  customerPersistence: IncomingOrderProposalCustomerPersistence,
): AcceptIncomingOrderProposalOperations => ({
  lockCommand: (idempotencyKey) => lockIncomingOrderCommand(tx, idempotencyKey),
  loadResolutionByIdempotencyKey: (idempotencyKey) =>
    loadIncomingOrderProposalResolutionByIdempotencyKey(tx, idempotencyKey),
  loadCanonicalOrderCommandReceipt: (idempotencyKey) =>
    loadOrderCommandReceipt(tx, idempotencyKey),
  loadProposal: (proposalId) => loadIncomingOrderProposal(tx, proposalId),
  lockSource: (source, externalOrderId) =>
    lockIncomingOrderSource(tx, source, externalOrderId),
  lockProposal: (proposalId) => lockIncomingOrderProposal(tx, proposalId),
  findExactOrder: (source, externalOrderId) =>
    findExactCanonicalOrder(tx, source, externalOrderId),
  resolveOrCreateExactCustomer: (proposal, now, context) =>
    resolveOrCreateExactCustomer(
      tx,
      customerPersistence,
      proposal,
      context,
      now,
    ),
  acceptProposal: async (input) => {
    const businessId = await businessIdForLocation(
      tx,
      input.proposal.locationId,
    );
    const canonical: OrderInput = {
      customer: input.customer,
      displayNumber: input.proposal.snapshot.displayNumber,
      state: input.canonical.state,
      dueAt: input.proposal.snapshot.dueAt,
      currency: input.proposal.snapshot.currency,
      totalAmountCents: input.proposal.snapshot.totalAmountCents,
      balanceDueCents: input.proposal.snapshot.balanceDueCents,
      items: input.proposal.snapshot.items,
      fulfillment: {
        ...input.proposal.snapshot.fulfillment,
        releaseState: input.canonical.releaseState,
        bagCount: null,
      },
    };
    const value = await createStoredPresslyOrder(tx, {
      businessId,
      order: canonical,
      now: input.decidedAt,
    });
    const [sourceLink] = await tx
      .insert(orderSchema.orderSourceLinks)
      .values({
        source: input.proposal.source,
        externalOrderId: input.proposal.externalOrderId,
        orderId: value.orderId,
        createdAt: input.decidedAt,
        updatedAt: input.decidedAt,
      })
      .returning({ id: orderSchema.orderSourceLinks.id });

    if (sourceLink === undefined)
      throw incomingOrderProposalInvariant(
        'INCOMING_ORDER_SOURCE_LINK_INSERT_RESULT_MISSING',
        'Accepted proposal source link returned no row.',
      );

    await tx.insert(orderSchema.orderSourceSnapshots).values({
      sourceLinkId: sourceLink.id,
      sourceRevisionAt: input.proposal.sourceRevisionAt,
      sourceRevisionHash: input.proposal.sourceRevisionHash,
      adapterVersion: input.proposal.adapterVersion,
      sourceLifecycleCode: null,
      normalizedPayload: input.proposal.sourceNormalizedPayload,
      observedAt: input.proposal.observedAt,
      createdAt: input.decidedAt,
      updatedAt: input.decidedAt,
    });

    const proposalCustomer = input.proposal.snapshot.customer;
    await tx.insert(orderSchema.orderSourceCustomerRefs).values({
      orderSourceLinkId: sourceLink.id,
      externalUserId: proposalCustomer?.externalUserId ?? null,
      resolvedUserId:
        input.customer.resolution === 'resolved' ? input.customer.userId : null,
      resolution: input.customer.resolution,
      observedAt: input.proposal.observedAt,
      updatedAt: input.decidedAt,
    });

    await saveOrderCommandReceipt(tx, {
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      value,
      now: input.decidedAt,
    });
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
      decision: 'accepted',
      proposalVersion: input.transition.version,
      orderId: value.orderId,
      fulfillmentId: value.fulfillmentId,
      idempotencyKey: input.idempotencyKey,
      commandHash: input.commandHash,
      context: input.context,
      reasonCode: input.reasonCode,
      reasonNote: input.reasonNote,
      decidedAt: input.decidedAt,
    });

    return value;
  },
});

export const makePostgresAcceptIncomingOrderProposalRepository = (
  db: Database,
  customerPersistence: IncomingOrderProposalCustomerPersistence,
): AcceptIncomingOrderProposalRepository =>
  defineResultUnitOfWork(db, (transaction) =>
    acceptIncomingOrderProposalOperations(transaction, customerPersistence),
  );
