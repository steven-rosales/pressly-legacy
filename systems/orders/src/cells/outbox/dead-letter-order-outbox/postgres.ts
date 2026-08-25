import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { DeadLetterOrderOutboxRepository } from './types.ts';

export const makeDeadLetterOrderOutboxPostgresRepository = (
  db: PostgresDatabase,
  orders: Pick<OrdersSchema, 'orderOutboxEvents'>,
): DeadLetterOrderOutboxRepository => ({
  deadLetter: async ({ command, now }) => {
    const [deadLettered] = await db
      .update(orders.orderOutboxEvents)
      .set({
        status: 'dead',
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadAt: now,
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

    return deadLettered !== undefined;
  },
});
