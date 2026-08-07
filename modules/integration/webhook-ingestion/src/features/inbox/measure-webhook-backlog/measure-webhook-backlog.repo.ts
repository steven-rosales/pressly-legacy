import type { Database } from '@pressly/db/client';
import { count, eq, min, or } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { MeasureWebhookBacklogRepository } from './measure-webhook-backlog.port.ts';

export const makePostgresMeasureWebhookBacklogRepository =
  (db: Database): MeasureWebhookBacklogRepository =>
  async (now) => {
    const [backlog] = await db
      .select({
        pendingCount: count(),
        oldestReceivedAt: min(webhookIngestion.webhookEvents.receivedAt),
      })
      .from(webhookIngestion.webhookEvents)
      .where(
        or(
          eq(webhookIngestion.webhookEvents.status, 'pending'),
          eq(webhookIngestion.webhookEvents.status, 'processing'),
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
  };
