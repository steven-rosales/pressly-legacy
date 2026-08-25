import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, asc, eq, lte, or, sql } from '@pressly/postgres/query';
import type { ClaimedOrderOutboxEvent } from '../../../model/order-outbox/model.ts';
import {
  claimedOrderOutboxEventFromRow,
  type StoredOrderOutboxEvent,
} from './stored-event.postgres.ts';
import type { ClaimOrderOutboxRepository } from './types.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';

export type ClaimedOrderOutboxEventMapper = (
  row: StoredOrderOutboxEvent,
  lease: Readonly<{ owner: string; expiresAt: Date }>,
) => ClaimedOrderOutboxEvent;

export const makeClaimOrderOutboxPostgresRepository = (input: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderOutboxEvents'>;
  mapClaimedEvent?: ClaimedOrderOutboxEventMapper;
}): ClaimOrderOutboxRepository => ({
  claim: ({ command, now }) =>
    input.db.transaction(async (transaction) => {
      const orders = input.schema;
      const candidates = await transaction
        .select({ id: orders.orderOutboxEvents.id })
        .from(orders.orderOutboxEvents)
        .where(
          or(
            and(
              eq(orders.orderOutboxEvents.status, 'pending'),
              lte(orders.orderOutboxEvents.availableAt, now),
            ),
            and(
              eq(orders.orderOutboxEvents.status, 'processing'),
              lte(orders.orderOutboxEvents.leaseExpiresAt, now),
            ),
          ),
        )
        .orderBy(asc(orders.orderOutboxEvents.availableAt))
        .limit(command.limit)
        .for('update', { skipLocked: true });
      const leaseExpiresAt = new Date(now.getTime() + command.leaseMs);
      const claimed: ClaimedOrderOutboxEvent[] = [];
      const mapClaimedEvent =
        input.mapClaimedEvent ?? claimedOrderOutboxEventFromRow;

      for (const candidate of candidates) {
        const [row] = await transaction
          .update(orders.orderOutboxEvents)
          .set({
            status: 'processing',
            attempts: sql`${orders.orderOutboxEvents.attempts} + 1`,
            leaseOwner: command.workerId,
            leaseExpiresAt,
            completedAt: null,
            deadAt: null,
          })
          .where(eq(orders.orderOutboxEvents.id, candidate.id))
          .returning();

        if (row === undefined) continue;
        claimed.push(
          mapClaimedEvent(row, {
            owner: command.workerId,
            expiresAt: leaseExpiresAt,
          }),
        );
      }

      return Object.freeze(claimed);
    }),
});
