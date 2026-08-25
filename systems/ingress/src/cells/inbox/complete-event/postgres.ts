import type { PostgresDatabase } from '@pressly/postgres/client';
import { webhookEventClaimFence } from '../../../postgres/webhook-event-claim-fence.postgres.ts';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { CompleteEventRepository } from './types.ts';

export const makeCompleteEventPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): CompleteEventRepository => ({
  complete: async (input) => {
    const [updated] = await db
      .update(ingress.webhookEvents)
      .set({
        status: 'processed',
        processedAt: input.processedAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(webhookEventClaimFence(ingress, input))
      .returning({ id: ingress.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  },
});
