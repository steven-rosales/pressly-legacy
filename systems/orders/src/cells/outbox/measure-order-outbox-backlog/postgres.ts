import type { PostgresDatabase } from '@pressly/postgres/client';
import { count, eq, min, or } from '@pressly/postgres/query';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { MeasureOrderOutboxBacklogRepository } from './types.ts';

export const makeMeasureOrderOutboxBacklogPostgresRepository = (
  db: PostgresDatabase,
  orders: Pick<OrdersSchema, 'orderOutboxEvents'>,
): MeasureOrderOutboxBacklogRepository => ({
  measure: async () => {
    const [backlog] = await db
      .select({
        pendingCount: count(),
        oldestPendingAt: min(orders.orderOutboxEvents.createdAt),
      })
      .from(orders.orderOutboxEvents)
      .where(
        or(
          eq(orders.orderOutboxEvents.status, 'pending'),
          eq(orders.orderOutboxEvents.status, 'processing'),
        ),
      );

    return {
      pendingCount: backlog?.pendingCount ?? 0,
      oldestPendingAt: backlog?.oldestPendingAt ?? null,
    };
  },
});
