import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { RetryOrderOutboxRepository } from './types.ts';

export const makeRetryOrderOutboxPostgresRepository = (
  db: PostgresDatabase,
  orders: Pick<OrdersSchema, 'orderOutboxEvents'>,
): RetryOrderOutboxRepository => ({
  retry: async (command) => {
    const [retried] = await db
      .update(orders.orderOutboxEvents)
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
          eq(orders.orderOutboxEvents.id, command.eventId),
          eq(orders.orderOutboxEvents.status, 'processing'),
          eq(orders.orderOutboxEvents.leaseOwner, command.workerId),
        ),
      )
      .returning({ id: orders.orderOutboxEvents.id });

    return retried !== undefined;
  },
});
