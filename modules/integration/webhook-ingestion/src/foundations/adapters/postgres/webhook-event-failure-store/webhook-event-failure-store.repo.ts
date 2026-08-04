import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import type { WebhookEventFailureStore } from '../../../ports/webhook-event-failure-store/webhook-event-failure-store.port.ts';

const claimPredicate = (input: {
  eventId: string;
  workerId: string;
  attempt: number;
}) =>
  and(
    eq(webhookIngestion.webhookEvents.id, input.eventId),
    eq(webhookIngestion.webhookEvents.status, 'processing'),
    eq(webhookIngestion.webhookEvents.leaseOwner, input.workerId),
    eq(webhookIngestion.webhookEvents.attempts, input.attempt),
  );

export const makePostgresWebhookEventFailureStore = (
  db: Database,
): WebhookEventFailureStore => ({
  retry: async (input) => {
    const [updated] = await db
      .update(webhookIngestion.webhookEvents)
      .set({
        status: 'pending',
        availableAt: input.availableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: input.code,
        lastErrorMessage: input.message,
      })
      .where(claimPredicate(input))
      .returning({ id: webhookIngestion.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  },

  deadLetter: async (input) => {
    const [updated] = await db
      .update(webhookIngestion.webhookEvents)
      .set({
        status: 'dead',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: input.code,
        lastErrorMessage: input.message,
      })
      .where(claimPredicate(input))
      .returning({ id: webhookIngestion.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  },
});
