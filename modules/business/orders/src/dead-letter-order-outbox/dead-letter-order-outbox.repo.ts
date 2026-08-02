import { and, eq, orders as schema, type Database } from '@pressly/db';
import type { DeadLetterOrderOutboxRepository } from './dead-letter-order-outbox.port.ts';

export const makePostgresDeadLetterOrderOutboxRepository = (
  db: Database,
): DeadLetterOrderOutboxRepository => ({
  deadLetter: async (input) => {
    const [deadLettered] = await db
      .update(schema.orderOutboxEvents)
      .set({
        status: 'dead',
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadAt: input.now,
        lastErrorCode: input.command.errorCode,
        lastErrorMessage: input.command.errorMessage,
      })
      .where(
        and(
          eq(schema.orderOutboxEvents.id, input.command.eventId),
          eq(schema.orderOutboxEvents.status, 'processing'),
          eq(schema.orderOutboxEvents.leaseOwner, input.command.workerId),
        ),
      )
      .returning({ id: schema.orderOutboxEvents.id });

    return deadLettered !== undefined;
  },
});
