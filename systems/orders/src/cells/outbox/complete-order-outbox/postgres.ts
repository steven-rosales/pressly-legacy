import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { CompleteOrderOutboxRepository } from './types.ts';

export const makeCompleteOrderOutboxPostgresRepository = (
  db: PostgresDatabase,
  orders: Pick<OrdersSchema, 'orderOutboxEvents'>,
): CompleteOrderOutboxRepository => ({
  complete: async ({ command, now }) => {
    const [completed] = await db
      .update(orders.orderOutboxEvents)
      .set({
        status: 'completed',
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: now,
        deadAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      })
      .where(
        and(
          eq(orders.orderOutboxEvents.id, command.eventId),
          eq(orders.orderOutboxEvents.status, 'processing'),
          eq(orders.orderOutboxEvents.leaseOwner, command.workerId),
        ),
      )
      .returning({ id: orders.orderOutboxEvents.id });

    return completed !== undefined;
  },
});
