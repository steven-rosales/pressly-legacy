import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import type { RetryOrderOutboxRepository } from './retry-order-outbox.port.ts';

export const makePostgresRetryOrderOutboxRepository = (
  db: Database,
): RetryOrderOutboxRepository => ({
  retry: async (command) => {
    const [retried] = await db
      .update(schema.orderOutboxEvents)
      .set({
        status: 'pending',
        availableAt: command.availableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadAt: null,
        lastErrorCode: command.errorCode,
        lastErrorMessage: command.errorMessage,
      })
      .where(
        and(
          eq(schema.orderOutboxEvents.id, command.eventId),
          eq(schema.orderOutboxEvents.status, 'processing'),
          eq(schema.orderOutboxEvents.leaseOwner, command.workerId),
        ),
      )
      .returning({ id: schema.orderOutboxEvents.id });

    return retried !== undefined;
  },
});
