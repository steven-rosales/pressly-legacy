import type { Database } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { ReplayDeadWebhookEventRepository } from './replay-dead-event.port.ts';

export const makePostgresReplayDeadWebhookEventRepository =
  (db: Database): ReplayDeadWebhookEventRepository =>
  (eventId, now) =>
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
    });
