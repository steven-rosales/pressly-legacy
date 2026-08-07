import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, sql } from '@pressly/db/query';
import * as orderSchema from '@pressly/db/schema/orders';
import type { CommandContext } from '@pressly/kernel';
import { lockOrderKey } from '../order-store/order-store.repo.ts';
import { incomingOrderProposalInvariant } from '../../../language/incoming-order-proposal/incoming-order-proposal.error.ts';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderProposalResolution,
  IncomingOrderProposalTransition,
  IncomingOrderSourceTombstone,
} from '../../../language/incoming-order-proposal/incoming-order-proposal.entity.ts';
import type { IncomingOrderProposalEvent } from '../../../language/incoming-order-proposal/incoming-order-proposal.model.ts';
import {
  storedIncomingOrderProposalFromRows,
  storedIncomingOrderProposalResolutionFromRow,
  storedIncomingOrderProposalTransitionFromRow,
  storedIncomingOrderSourceTombstoneFromRow,
} from './incoming-order-proposal-store.persistence.mapper.ts';

type AppendIncomingOrderProposalTransitionInput = Readonly<{
  proposalId: string;
  expectedVersion: number;
  transition: Readonly<{
    from: 'pending' | 'source_closed' | 'restored_pending';
    to: 'source_closed' | 'restored_pending' | 'accepted' | 'rejected';
    event: IncomingOrderProposalEvent;
    version: number;
  }>;
  idempotencyKey: string;
  commandHash: string;
  context: CommandContext;
  reasonCode: string;
  reasonNote: string | null;
  sourceTerminalCode: 'completed' | 'canceled' | null;
  occurredAt: Date;
}>;

type InsertIncomingOrderProposalResolutionInput = Readonly<{
  proposalId: string;
  decision: 'accepted' | 'rejected';
  proposalVersion: number;
  orderId: string | null;
  fulfillmentId: string | null;
  idempotencyKey: string;
  commandHash: string;
  context: CommandContext;
  reasonCode: string;
  reasonNote: string | null;
  decidedAt: Date;
}>;

export const findExactCanonicalOrder = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<ExactCanonicalOrder | null> => {
  const [row] = await tx
    .select({
      orderId: orderSchema.orderSourceLinks.orderId,
      fulfillmentId: orderSchema.orderFulfillments.id,
      locationId: orderSchema.orderFulfillments.locationId,
      releaseState: orderSchema.orderFulfillments.releaseState,
    })
    .from(orderSchema.orderSourceLinks)
    .leftJoin(
      orderSchema.orderFulfillments,
      eq(
        orderSchema.orderFulfillments.orderId,
        orderSchema.orderSourceLinks.orderId,
      ),
    )
    .where(
      and(
        eq(orderSchema.orderSourceLinks.source, source),
        eq(orderSchema.orderSourceLinks.externalOrderId, externalOrderId),
      ),
    )
    .limit(1);

  if (row === undefined) return null;
  if (row.fulfillmentId === null)
    return { orderId: row.orderId, fulfillment: null };
  if (
    row.locationId === null ||
    (row.releaseState !== 'unreleased' &&
      row.releaseState !== 'released' &&
      row.releaseState !== 'withdrawn')
  )
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_CANONICAL_FULFILLMENT_INVALID',
      'Stored canonical fulfillment is incomplete.',
    );

  return {
    orderId: row.orderId,
    fulfillment: {
      fulfillmentId: row.fulfillmentId,
      locationId: row.locationId,
      releaseState: row.releaseState,
    },
  };
};

export const findIncomingOrderSourceTombstone = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<IncomingOrderSourceTombstone | null> => {
  const [row] = await tx
    .select()
    .from(orderSchema.orderSourceTerminalTombstones)
    .where(
      and(
        eq(orderSchema.orderSourceTerminalTombstones.source, source),
        eq(
          orderSchema.orderSourceTerminalTombstones.externalOrderId,
          externalOrderId,
        ),
      ),
    )
    .limit(1);

  return row === undefined
    ? null
    : storedIncomingOrderSourceTombstoneFromRow(row);
};

const proposalSelection = Object.freeze({
  proposal: orderSchema.orderSourceProposals,
  resolution: orderSchema.orderSourceProposalResolutions,
  tombstone: orderSchema.orderSourceTerminalTombstones,
});

const proposalQuery = (tx: DatabaseExecutor) =>
  tx
    .select(proposalSelection)
    .from(orderSchema.orderSourceProposals)
    .leftJoin(
      orderSchema.orderSourceProposalResolutions,
      eq(
        orderSchema.orderSourceProposalResolutions.proposalId,
        orderSchema.orderSourceProposals.id,
      ),
    )
    .leftJoin(
      orderSchema.orderSourceTerminalTombstones,
      and(
        eq(
          orderSchema.orderSourceTerminalTombstones.source,
          orderSchema.orderSourceProposals.source,
        ),
        eq(
          orderSchema.orderSourceTerminalTombstones.externalOrderId,
          orderSchema.orderSourceProposals.externalOrderId,
        ),
      ),
    );

export const findIncomingOrderProposal = async (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<IncomingOrderProposal | null> => {
  const [row] = await proposalQuery(tx)
    .where(
      and(
        eq(orderSchema.orderSourceProposals.source, source),
        eq(orderSchema.orderSourceProposals.externalOrderId, externalOrderId),
      ),
    )
    .limit(1);

  return row === undefined
    ? null
    : storedIncomingOrderProposalFromRows(
        row.proposal,
        row.resolution,
        row.tombstone,
      );
};

export const loadIncomingOrderProposal = async (
  tx: DatabaseExecutor,
  proposalId: string,
): Promise<IncomingOrderProposal | null> => {
  const [row] = await proposalQuery(tx)
    .where(eq(orderSchema.orderSourceProposals.id, proposalId))
    .limit(1);

  return row === undefined
    ? null
    : storedIncomingOrderProposalFromRows(
        row.proposal,
        row.resolution,
        row.tombstone,
      );
};

export const lockIncomingOrderSource = (
  tx: DatabaseExecutor,
  source: string,
  externalOrderId: string,
): Promise<void> =>
  lockOrderKey(tx, `orders:source:${source}:${externalOrderId}`);

export const lockIncomingOrderCommand = (
  tx: DatabaseExecutor,
  idempotencyKey: string,
): Promise<void> => lockOrderKey(tx, `orders:command:${idempotencyKey}`);

export const lockIncomingOrderProposal = async (
  tx: DatabaseExecutor,
  proposalId: string,
): Promise<void> => {
  await tx.execute(
    sql`select 1 from ${orderSchema.orderSourceProposals} where ${orderSchema.orderSourceProposals.id} = ${proposalId} for update`,
  );
};

export const loadIncomingOrderProposalResolutionByIdempotencyKey = async (
  tx: DatabaseExecutor,
  idempotencyKey: string,
): Promise<
  (IncomingOrderProposalResolution & Readonly<{ proposalId: string }>) | null
> => {
  const [row] = await tx
    .select()
    .from(orderSchema.orderSourceProposalResolutions)
    .where(
      eq(
        orderSchema.orderSourceProposalResolutions.idempotencyKey,
        idempotencyKey,
      ),
    )
    .limit(1);

  if (row === undefined) return null;
  const resolution = storedIncomingOrderProposalResolutionFromRow(row);
  if (resolution === null)
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_RESOLUTION_MISSING',
      'Stored proposal resolution disappeared.',
    );

  return { proposalId: row.proposalId, ...resolution };
};

export const loadIncomingOrderProposalTransitionByIdempotencyKey = async (
  tx: DatabaseExecutor,
  idempotencyKey: string,
): Promise<IncomingOrderProposalTransition | null> => {
  const [row] = await tx
    .select()
    .from(orderSchema.orderSourceProposalTransitions)
    .where(
      eq(
        orderSchema.orderSourceProposalTransitions.idempotencyKey,
        idempotencyKey,
      ),
    )
    .limit(1);

  if (row === undefined) return null;
  return storedIncomingOrderProposalTransitionFromRow(row);
};

export const appendIncomingOrderProposalTransition = async (
  tx: DatabaseExecutor,
  input: AppendIncomingOrderProposalTransitionInput,
): Promise<void> => {
  const [advanced] = await tx
    .update(orderSchema.orderSourceProposals)
    .set({
      state: input.transition.to,
      version: input.transition.version,
    })
    .where(
      and(
        eq(orderSchema.orderSourceProposals.id, input.proposalId),
        eq(orderSchema.orderSourceProposals.state, input.transition.from),
        eq(orderSchema.orderSourceProposals.version, input.expectedVersion),
      ),
    )
    .returning({ id: orderSchema.orderSourceProposals.id });

  if (advanced === undefined)
    throw incomingOrderProposalInvariant(
      'INCOMING_ORDER_PROPOSAL_VERSION_CONFLICT',
      'The locked incoming order proposal changed before its transition was stored.',
    );

  await tx.insert(orderSchema.orderSourceProposalTransitions).values({
    proposalId: input.proposalId,
    fromState: input.transition.from,
    toState: input.transition.to,
    eventType: input.transition.event,
    proposalVersion: input.transition.version,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    sourceTerminalCode: input.sourceTerminalCode,
    occurredAt: input.occurredAt,
  });
};

export const insertIncomingOrderProposalResolution = async (
  tx: DatabaseExecutor,
  input: InsertIncomingOrderProposalResolutionInput,
): Promise<void> => {
  await tx.insert(orderSchema.orderSourceProposalResolutions).values({
    proposalId: input.proposalId,
    decision: input.decision,
    proposalVersion: input.proposalVersion,
    orderId: input.orderId,
    fulfillmentId: input.fulfillmentId,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    decidedAt: input.decidedAt,
  });
};
