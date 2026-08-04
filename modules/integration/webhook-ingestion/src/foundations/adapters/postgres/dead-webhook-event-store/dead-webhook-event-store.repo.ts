import { type Database } from '@pressly/db/client';
import { and, asc, eq, gt } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { DeadWebhookEventStore } from '../../../ports/dead-webhook-event-store/dead-webhook-event-store.port.ts';

export const makePostgresDeadWebhookEventStore = (
  db: Database,
): DeadWebhookEventStore => ({
  list: async ({ source, afterEventId, limit }) => {
    const rows = await db
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
    return rows;
  },

  replay: (eventId, now) =>
    db.transaction(async (transaction) => {
      const [event] = await transaction
        .select({ status: webhookIngestion.webhookEvents.status })
        .from(webhookIngestion.webhookEvents)
        .where(eq(webhookIngestion.webhookEvents.id, eventId))
        .limit(1)
        .for('update');
      if (event === undefined) return 'not_found';
      if (event.status === 'pending') return 'already_queued';
      if (event.status !== 'dead') return 'not_replayable';
      await transaction
        .update(webhookIngestion.webhookEvents)
        .set({
          status: 'pending',
          availableAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        })
        .where(eq(webhookIngestion.webhookEvents.id, eventId));
      return 'queued';
    }),
});
