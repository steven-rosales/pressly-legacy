import { and, eq, orders as schema, type Database } from '@pressly/db';
import type { CompleteOrderOutboxRepository } from './complete-order-outbox.port.ts';

export const makePostgresCompleteOrderOutboxRepository = (
  db: Database,
): CompleteOrderOutboxRepository => ({
  complete: async (input) => {
    const [completed] = await db
      .update(schema.orderOutboxEvents)
      .set({
        status: 'completed',
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: input.now,
        deadAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(
        and(
          eq(schema.orderOutboxEvents.id, input.command.eventId),
          eq(schema.orderOutboxEvents.status, 'processing'),
          eq(schema.orderOutboxEvents.leaseOwner, input.command.workerId),
        ),
      )
      .returning({ id: schema.orderOutboxEvents.id });

    return completed !== undefined;
  },
});
