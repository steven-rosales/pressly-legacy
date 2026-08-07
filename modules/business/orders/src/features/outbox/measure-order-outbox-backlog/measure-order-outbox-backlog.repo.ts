import type { Database } from '@pressly/db/client';
import { count, eq, min, or } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import type { MeasureOrderOutboxBacklogRepository } from './measure-order-outbox-backlog.port.ts';

export const makePostgresMeasureOrderOutboxBacklogRepository =
  (db: Database): MeasureOrderOutboxBacklogRepository =>
  async () => {
    const [backlog] = await db
      .select({
        pendingCount: count(),
        oldestPendingAt: min(schema.orderOutboxEvents.createdAt),
      })
      .from(schema.orderOutboxEvents)
      .where(
        or(
          eq(schema.orderOutboxEvents.status, 'pending'),
          eq(schema.orderOutboxEvents.status, 'processing'),
        ),
      );

    return {
      pendingCount: backlog?.pendingCount ?? 0,
      oldestPendingAt: backlog?.oldestPendingAt ?? null,
    };
  };
