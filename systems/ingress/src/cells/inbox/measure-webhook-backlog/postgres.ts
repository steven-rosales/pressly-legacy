import type { PostgresDatabase } from '@pressly/postgres/client';
import { count, eq, min, or } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { MeasureWebhookBacklogRepository } from './types.ts';

export const makeMeasureWebhookBacklogPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): MeasureWebhookBacklogRepository => ({
  measure: async (now) => {
    const [backlog] = await db
      .select({
        pendingCount: count(),
        oldestReceivedAt: min(ingress.webhookEvents.receivedAt),
      })
      .from(ingress.webhookEvents)
      .where(
        or(
          eq(ingress.webhookEvents.status, 'pending'),
          eq(ingress.webhookEvents.status, 'processing'),
        ),
      );
    const oldest = backlog?.oldestReceivedAt;
    return {
      pendingCount: backlog?.pendingCount ?? 0,
      oldestPendingAgeSeconds:
        oldest === null || oldest === undefined
          ? 0
          : Math.max(0, (now.getTime() - oldest.getTime()) / 1_000),
    };
  },
});
