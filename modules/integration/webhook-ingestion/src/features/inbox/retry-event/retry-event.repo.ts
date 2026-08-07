import type { Database } from '@pressly/db/client';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import { webhookEventClaimPredicate } from '../../../foundations/adapters/postgres/webhook-event-claim-fence/webhook-event-claim-fence.adapter.ts';
import type { RetryWebhookEvent } from './retry-event.port.ts';

export const makePostgresRetryWebhookEventRepository =
  (db: Database): RetryWebhookEvent =>
  async (input) => {
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
      .where(webhookEventClaimPredicate(input))
      .returning({ id: webhookIngestion.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  };
