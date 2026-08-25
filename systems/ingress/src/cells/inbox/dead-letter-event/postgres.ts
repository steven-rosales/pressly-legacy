import type { PostgresDatabase } from '@pressly/postgres/client';
import { webhookEventClaimFence } from '../../../postgres/webhook-event-claim-fence.postgres.ts';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { DeadLetterEventRepository } from './types.ts';

export const makeDeadLetterEventPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): DeadLetterEventRepository => ({
  deadLetter: async (input) => {
    const [updated] = await db
      .update(ingress.webhookEvents)
      .set({
        status: 'dead',
        leaseOwner: null,
        leaseExpiresAt: null,
        lastErrorCode: input.code,
        lastErrorMessage: input.message,
      })
      .where(webhookEventClaimFence(ingress, input))
      .returning({ id: ingress.webhookEvents.id });
    return updated === undefined ? 'lease_lost' : 'applied';
  },
});
