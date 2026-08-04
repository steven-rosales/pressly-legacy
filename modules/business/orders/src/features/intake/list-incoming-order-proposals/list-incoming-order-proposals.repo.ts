import { type Database } from '@pressly/db/client';
import { and, desc, eq, inArray, lt, or } from '@pressly/db/query';
import * as orderSchema from '@pressly/db/schema/orders';
import {
  decodeIncomingOrderProposalCursor,
  encodeIncomingOrderProposalCursor,
} from './list-incoming-order-proposals.policy.ts';
import { incomingOrderProposalSummaryFromRows } from './list-incoming-order-proposals.persistence.mapper.ts';
import type { ListIncomingOrderProposalsRepository } from './list-incoming-order-proposals.port.ts';

export const makePostgresListIncomingOrderProposalsRepository = (
  db: Database,
): ListIncomingOrderProposalsRepository => ({
  list: async (query) => {
    const cursor =
      query.cursor === null
        ? null
        : decodeIncomingOrderProposalCursor(query.cursor);
    if (
      query.cursor !== null &&
      (cursor === null || cursor.view !== query.view)
    )
      return { kind: 'invalid_cursor' };

    const cursorPredicate =
      cursor === null
        ? undefined
        : or(
            lt(orderSchema.orderSourceProposals.observedAt, cursor.observedAt),
            and(
              eq(
                orderSchema.orderSourceProposals.observedAt,
                cursor.observedAt,
              ),
              lt(orderSchema.orderSourceProposals.id, cursor.id),
            ),
          );
    const rows = await db
      .select({
        proposal: orderSchema.orderSourceProposals,
        linkedOrderId: orderSchema.orderSourceLinks.orderId,
        tombstone: orderSchema.orderSourceTerminalTombstones,
      })
      .from(orderSchema.orderSourceProposals)
      .leftJoin(
        orderSchema.orderSourceLinks,
        and(
          eq(
            orderSchema.orderSourceLinks.source,
            orderSchema.orderSourceProposals.source,
          ),
          eq(
            orderSchema.orderSourceLinks.externalOrderId,
            orderSchema.orderSourceProposals.externalOrderId,
          ),
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
      )
      .where(
        and(
          eq(orderSchema.orderSourceProposals.locationId, query.locationId),
          query.view === 'needs_review'
            ? inArray(orderSchema.orderSourceProposals.state, [
                'pending',
                'restored_pending',
              ])
            : eq(orderSchema.orderSourceProposals.state, 'source_closed'),
          cursorPredicate,
        ),
      )
      .orderBy(
        desc(orderSchema.orderSourceProposals.observedAt),
        desc(orderSchema.orderSourceProposals.id),
      )
      .limit(query.limit + 1);

    const pageRows = rows.slice(0, query.limit);
    const items = pageRows.map(incomingOrderProposalSummaryFromRows);
    const last = pageRows.at(-1)?.proposal;

    return {
      kind: 'ok',
      value: {
        items,
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeIncomingOrderProposalCursor({
                view: query.view,
                observedAt: last.observedAt,
                id: last.id,
              })
            : null,
      },
    };
  },
});
