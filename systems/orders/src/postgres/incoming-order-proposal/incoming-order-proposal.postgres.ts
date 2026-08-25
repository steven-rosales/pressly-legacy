import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ExactCanonicalOrder,
  IncomingOrderProposal,
  IncomingOrderProposalResolution,
  IncomingOrderProposalTransition,
  IncomingOrderSourceTombstone,
} from '../../model/incoming-order-proposal/model.ts';
import {
  storedIncomingOrderProposalFromRows,
  storedIncomingOrderSourceTombstoneFromRow,
} from './stored-proposal.postgres.ts';
import type { OrdersSchema } from '../../schema/orders.ts';

export type IncomingOrderProposalStoreSchema = Pick<
  OrdersSchema,
  | 'orderFulfillments'
  | 'orderSourceLinks'
  | 'orderSourceProposalResolutions'
  | 'orderSourceProposals'
  | 'orderSourceProposalTransitions'
  | 'orderSourceTerminalTombstones'
>;

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored incoming order data is inconsistent.',
  });

export const lockIncomingOrderSource = async (
  transaction: PostgresExecutor,
  source: string,
  externalOrderId: string,
): Promise<void> => {
  const key = `orders:source:${source}:${externalOrderId}`;
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const lockIncomingOrderProposal = async (
  transaction: PostgresExecutor,
  orders: Pick<IncomingOrderProposalStoreSchema, 'orderSourceProposals'>,
  proposalId: string,
): Promise<void> => {
  await transaction.execute(
    sql`select 1 from ${orders.orderSourceProposals} where ${orders.orderSourceProposals.id} = ${proposalId} for update`,
  );
};

export const lockIncomingOrderCommand = async (
  transaction: PostgresExecutor,
  idempotencyKey: string,
): Promise<void> => {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`orders:command:${idempotencyKey}`}, 0))`,
  );
};

export const findExactCanonicalOrder = async (
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderFulfillments' | 'orderSourceLinks'
  >,
  source: string,
  externalOrderId: string,
): Promise<ExactCanonicalOrder | null> => {
  const [row] = await transaction
    .select({
      orderId: orders.orderSourceLinks.orderId,
      fulfillmentId: orders.orderFulfillments.id,
      locationId: orders.orderFulfillments.locationId,
      releaseState: orders.orderFulfillments.releaseState,
    })
    .from(orders.orderSourceLinks)
    .leftJoin(
      orders.orderFulfillments,
      eq(orders.orderFulfillments.orderId, orders.orderSourceLinks.orderId),
    )
    .where(
      and(
        eq(orders.orderSourceLinks.source, source),
        eq(orders.orderSourceLinks.externalOrderId, externalOrderId),
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
    throw invariant(
      'incoming_order_canonical_fulfillment_invalid',
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
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderSourceTerminalTombstones'
  >,
  source: string,
  externalOrderId: string,
): Promise<IncomingOrderSourceTombstone | null> => {
  const [row] = await transaction
    .select()
    .from(orders.orderSourceTerminalTombstones)
    .where(
      and(
        eq(orders.orderSourceTerminalTombstones.source, source),
        eq(
          orders.orderSourceTerminalTombstones.externalOrderId,
          externalOrderId,
        ),
      ),
    )
    .limit(1);

  return row === undefined
    ? null
    : storedIncomingOrderSourceTombstoneFromRow(row);
};

const proposalSelection = (orders: IncomingOrderProposalStoreSchema) =>
  Object.freeze({
    proposal: orders.orderSourceProposals,
    resolution: orders.orderSourceProposalResolutions,
    tombstone: orders.orderSourceTerminalTombstones,
  });

const proposalQuery = (
  transaction: PostgresExecutor,
  orders: IncomingOrderProposalStoreSchema,
) =>
  transaction
    .select(proposalSelection(orders))
    .from(orders.orderSourceProposals)
    .leftJoin(
      orders.orderSourceProposalResolutions,
      eq(
        orders.orderSourceProposalResolutions.proposalId,
        orders.orderSourceProposals.id,
      ),
    )
    .leftJoin(
      orders.orderSourceTerminalTombstones,
      and(
        eq(
          orders.orderSourceTerminalTombstones.source,
          orders.orderSourceProposals.source,
        ),
        eq(
          orders.orderSourceTerminalTombstones.externalOrderId,
          orders.orderSourceProposals.externalOrderId,
        ),
      ),
    );

export const findIncomingOrderProposal = async (
  transaction: PostgresExecutor,
  orders: IncomingOrderProposalStoreSchema,
  source: string,
  externalOrderId: string,
): Promise<IncomingOrderProposal | null> => {
  const [row] = await proposalQuery(transaction, orders)
    .where(
      and(
        eq(orders.orderSourceProposals.source, source),
        eq(orders.orderSourceProposals.externalOrderId, externalOrderId),
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
  transaction: PostgresExecutor,
  orders: IncomingOrderProposalStoreSchema,
  proposalId: string,
): Promise<IncomingOrderProposal | null> => {
  const [row] = await proposalQuery(transaction, orders)
    .where(eq(orders.orderSourceProposals.id, proposalId))
    .limit(1);

  return row === undefined
    ? null
    : storedIncomingOrderProposalFromRows(
        row.proposal,
        row.resolution,
        row.tombstone,
      );
};

export const loadIncomingOrderProposalResolutionByIdempotencyKey = async (
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderSourceProposalResolutions'
  >,
  idempotencyKey: string,
): Promise<
  (IncomingOrderProposalResolution & Readonly<{ proposalId: string }>) | null
> => {
  const [row] = await transaction
    .select()
    .from(orders.orderSourceProposalResolutions)
    .where(
      eq(orders.orderSourceProposalResolutions.idempotencyKey, idempotencyKey),
    )
    .limit(1);
  if (row === undefined) return null;
  if (
    (row.decision !== 'accepted' && row.decision !== 'rejected') ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion <= 1
  )
    throw invariant(
      'incoming_order_proposal_resolution_invalid',
      'Stored incoming proposal resolution is invalid.',
    );
  return {
    proposalId: row.proposalId,
    decision: row.decision,
    proposalVersion: row.proposalVersion,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
  };
};

export type StoredIncomingOrderProposalTransition = Readonly<{
  proposalId: string;
  from: 'pending' | 'source_closed' | 'restored_pending';
  to: 'source_closed' | 'restored_pending' | 'accepted' | 'rejected';
  event: 'accept' | 'reject' | 'source_close' | 'restore';
  proposalVersion: number;
  idempotencyKey: string;
  commandHash: string;
}>;

export const loadIncomingOrderProposalTransitionByIdempotencyKey = async (
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderSourceProposalTransitions'
  >,
  idempotencyKey: string,
): Promise<StoredIncomingOrderProposalTransition | null> => {
  const [row] = await transaction
    .select()
    .from(orders.orderSourceProposalTransitions)
    .where(
      eq(orders.orderSourceProposalTransitions.idempotencyKey, idempotencyKey),
    )
    .limit(1);
  if (row === undefined) return null;
  if (
    (row.fromState !== 'pending' &&
      row.fromState !== 'source_closed' &&
      row.fromState !== 'restored_pending') ||
    (row.toState !== 'source_closed' &&
      row.toState !== 'restored_pending' &&
      row.toState !== 'accepted' &&
      row.toState !== 'rejected') ||
    (row.eventType !== 'accept' &&
      row.eventType !== 'reject' &&
      row.eventType !== 'source_close' &&
      row.eventType !== 'restore') ||
    !Number.isInteger(row.proposalVersion) ||
    row.proposalVersion <= 1
  )
    throw invariant(
      'incoming_order_proposal_transition_invalid',
      'Stored incoming proposal transition is invalid.',
    );
  return {
    proposalId: row.proposalId,
    from: row.fromState,
    to: row.toState,
    event: row.eventType,
    proposalVersion: row.proposalVersion,
    idempotencyKey: row.idempotencyKey,
    commandHash: row.commandHash,
  };
};

export const appendIncomingOrderProposalTransition = async (
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderSourceProposals' | 'orderSourceProposalTransitions'
  >,
  input: IncomingOrderProposalTransition,
): Promise<void> => {
  const [advanced] = await transaction
    .update(orders.orderSourceProposals)
    .set({
      state: input.transition.to,
      version: input.transition.version,
    })
    .where(
      and(
        eq(orders.orderSourceProposals.id, input.proposalId),
        eq(orders.orderSourceProposals.state, input.transition.from),
        eq(orders.orderSourceProposals.version, input.expectedVersion),
      ),
    )
    .returning({ id: orders.orderSourceProposals.id });

  if (advanced === undefined)
    throw invariant(
      'incoming_order_proposal_version_conflict',
      'The locked incoming order proposal changed before its transition was stored.',
    );

  await transaction.insert(orders.orderSourceProposalTransitions).values({
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
  transaction: PostgresExecutor,
  orders: Pick<
    IncomingOrderProposalStoreSchema,
    'orderSourceProposalResolutions'
  >,
  input: Readonly<{
    proposalId: string;
    decision: 'accepted' | 'rejected';
    proposalVersion: number;
    orderId: string | null;
    fulfillmentId: string | null;
    idempotencyKey: string;
    commandHash: string;
    context: IncomingOrderProposalTransition['context'];
    reasonCode: string;
    reasonNote: string | null;
    decidedAt: Date;
  }>,
): Promise<void> => {
  await transaction.insert(orders.orderSourceProposalResolutions).values({
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
