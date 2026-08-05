import type { Database } from '@pressly/db/client';
import { and, asc, eq, gt } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { ListDeadWebhookEventsRepository } from './list-dead-events.port.ts';

export const makePostgresListDeadWebhookEventsRepository =
  (db: Database): ListDeadWebhookEventsRepository =>
  ({ source, afterEventId, limit }) =>
    db
      .select({
        eventId: webhookIngestion.webhookEvents.id,
        source: webhookIngestion.webhookEvents.source,
        eventType: webhookIngestion.webhookEvents.eventType,
        subjectType: webhookIngestion.webhookEvents.subjectType,
        subjectId: webhookIngestion.webhookEvents.subjectId,
        sourceLocationId: webhookIngestion.webhookEvents.sourceLocationId,
        sourceOccurredAt: webhookIngestion.webhookEvents.sourceOccurredAt,
        attempts: webhookIngestion.webhookEvents.attempts,
        lastErrorCode: webhookIngestion.webhookEvents.lastErrorCode,
        receivedAt: webhookIngestion.webhookEvents.receivedAt,
      })
      .from(webhookIngestion.webhookEvents)
      .where(
        and(
          eq(webhookIngestion.webhookEvents.status, 'dead'),
          source === undefined
            ? undefined
            : eq(webhookIngestion.webhookEvents.source, source),
          afterEventId === undefined
            ? undefined
            : gt(webhookIngestion.webhookEvents.id, afterEventId),
        ),
      )
      .orderBy(asc(webhookIngestion.webhookEvents.id))
      .limit(limit);
