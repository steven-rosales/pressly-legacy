import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { CompleteWebhookEventRepository } from './complete-event.port.ts';

export const makeCompleteWebhookEventRepository = (
  db: Database,
): CompleteWebhookEventRepository => ({
  complete: async ({ eventId, workerId, attempt, processedAt }) => {
    const [updated] = await db
      .update(webhookIngestion.webhookEvents)
      .set({
        status: 'processed',
        processedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(
        and(
          eq(webhookIngestion.webhookEvents.id, eventId),
          eq(webhookIngestion.webhookEvents.status, 'processing'),
          eq(webhookIngestion.webhookEvents.leaseOwner, workerId),
          eq(webhookIngestion.webhookEvents.attempts, attempt),
        ),
      )
      .returning({ id: webhookIngestion.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  },
});
