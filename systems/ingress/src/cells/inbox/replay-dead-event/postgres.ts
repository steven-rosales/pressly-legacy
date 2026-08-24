import type { PostgresDatabase } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { IngressSchema } from '../../../schema/ingress.ts';
import type { ReplayDeadEventRepository } from './types.ts';

export const makeReplayDeadEventPostgresRepository = (
  db: PostgresDatabase,
  ingress: Pick<IngressSchema, 'webhookEvents'>,
): ReplayDeadEventRepository => ({
  replay: (eventId, now) =>
    db.transaction(async (transaction) => {
      const [event] = await transaction
        .select({ status: ingress.webhookEvents.status })
        .from(ingress.webhookEvents)
        .where(eq(ingress.webhookEvents.id, eventId))
        .limit(1)
        .for('update');
      if (event === undefined) return 'not_found';
      if (event.status === 'pending') return 'already_queued';
      if (event.status !== 'dead') return 'not_replayable';
      await transaction
        .update(ingress.webhookEvents)
        .set({
          status: 'pending',
          availableAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        })
        .where(eq(ingress.webhookEvents.id, eventId));
      return 'queued';
    }),
});
