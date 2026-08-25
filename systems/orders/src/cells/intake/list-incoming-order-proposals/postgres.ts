import { invariantViolationError } from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, desc, eq, inArray, lt, or } from '@pressly/postgres/query';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { encodeIncomingOrderProposalCursor } from './decide.ts';
import type {
  IncomingOrderProposalSummary,
  ListIncomingOrderProposalsRepository,
} from './types.ts';

const summaryFromRows = (row: {
  proposal: OrdersSchema['orderSourceProposals']['$inferSelect'];
  linkedOrderId: string | null;
  tombstone:
    | OrdersSchema['orderSourceTerminalTombstones']['$inferSelect']
    | null;
}): IncomingOrderProposalSummary => {
  const { proposal, linkedOrderId, tombstone } = row;
  if (
    proposal.state !== 'pending' &&
    proposal.state !== 'source_closed' &&
    proposal.state !== 'restored_pending'
  )
    throw invariantViolationError({
      code: 'incoming_order_proposal_list_state_invalid',
      message: 'Stored incoming proposal list state is invalid.',
      safeMessage: 'Stored incoming order data is inconsistent.',
    });
  if (
    tombstone !== null &&
    tombstone.terminalCode !== 'completed' &&
    tombstone.terminalCode !== 'canceled'
  )
    throw invariantViolationError({
      code: 'incoming_order_proposal_list_tombstone_invalid',
      message: 'Stored incoming proposal source closure is invalid.',
      safeMessage: 'Stored incoming order data is inconsistent.',
    });
  return {
    id: proposal.id,
    version: proposal.version,
    state: proposal.state,
    source: proposal.source,
    externalOrderId: proposal.externalOrderId,
    locationId: proposal.locationId,
    displayNumber: proposal.displayNumber,
    customer:
      proposal.customerDisplayName === null &&
      proposal.customerPhone === null &&
      proposal.customerEmail === null
        ? null
        : {
            displayName: proposal.customerDisplayName,
            phone: proposal.customerPhone,
            email: proposal.customerEmail,
          },
    dueAt: proposal.dueAt,
    estimatedWeightLbs: proposal.estimatedWeightLbs,
    sourceReportedAt: proposal.sourceRevisionAt,
    reportedAt: proposal.observedAt,
    sourceClosure:
      proposal.state !== 'source_closed' || tombstone === null
        ? null
        : {
            kind:
              tombstone.terminalCode === 'completed' ? 'completed' : 'canceled',
            observedAt: tombstone.observedAt,
          },
    availableActions:
      proposal.state === 'source_closed'
        ? ['restore']
        : linkedOrderId === null
          ? ['accept', 'reject']
          : ['reject'],
    acceptBlockedReason: linkedOrderId === null ? null : 'exact_order_exists',
  };
};

export const makeListIncomingOrderProposalsPostgresRepository = (
  db: PostgresDatabase,
  orders: Pick<
    OrdersSchema,
    | 'orderSourceLinks'
    | 'orderSourceProposals'
    | 'orderSourceTerminalTombstones'
  >,
): ListIncomingOrderProposalsRepository => ({
  list: async ({ query, cursor }) => {
    const rows = await db
      .select({
        proposal: orders.orderSourceProposals,
        linkedOrderId: orders.orderSourceLinks.orderId,
        tombstone: orders.orderSourceTerminalTombstones,
      })
      .from(orders.orderSourceProposals)
      .leftJoin(
        orders.orderSourceLinks,
        and(
          eq(
            orders.orderSourceLinks.source,
            orders.orderSourceProposals.source,
          ),
          eq(
            orders.orderSourceLinks.externalOrderId,
            orders.orderSourceProposals.externalOrderId,
          ),
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
      )
      .where(
        and(
          eq(orders.orderSourceProposals.locationId, query.locationId),
          query.view === 'needs_review'
            ? inArray(orders.orderSourceProposals.state, [
                'pending',
                'restored_pending',
              ])
            : eq(orders.orderSourceProposals.state, 'source_closed'),
          cursor === null
            ? undefined
            : or(
                lt(orders.orderSourceProposals.observedAt, cursor.observedAt),
                and(
                  eq(orders.orderSourceProposals.observedAt, cursor.observedAt),
                  lt(orders.orderSourceProposals.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(
        desc(orders.orderSourceProposals.observedAt),
        desc(orders.orderSourceProposals.id),
      )
      .limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1)?.proposal;
    return {
      items: page.map(summaryFromRows),
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeIncomingOrderProposalCursor({
              view: query.view,
              observedAt: last.observedAt,
              id: last.id,
            })
          : null,
    };
  },
});
