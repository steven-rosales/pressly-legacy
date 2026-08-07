import { type Database } from '@pressly/db/client';
import { and, asc, eq, lte, or, sql } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import type { OrderOutboxEvent } from '../../../foundations/language/order-outbox/order-outbox.model.ts';
import { claimedOrderOutboxEventFromRow } from './claim-order-outbox.persistence.mapper.ts';
import type { ClaimOrderOutboxRepository } from './claim-order-outbox.port.ts';

export const makePostgresClaimOrderOutboxRepository = (
  db: Database,
): ClaimOrderOutboxRepository => ({
  claim: (input) =>
    db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: schema.orderOutboxEvents.id })
        .from(schema.orderOutboxEvents)
        .where(
          or(
            and(
              eq(schema.orderOutboxEvents.status, 'pending'),
              lte(schema.orderOutboxEvents.availableAt, input.now),
            ),
            and(
              eq(schema.orderOutboxEvents.status, 'processing'),
              lte(schema.orderOutboxEvents.leaseExpiresAt, input.now),
            ),
          ),
        )
        .orderBy(asc(schema.orderOutboxEvents.availableAt))
        .limit(input.command.limit)
        .for('update', { skipLocked: true });
      const leaseExpiresAt = new Date(
        input.now.getTime() + input.command.leaseMs,
      );
      const claimed: OrderOutboxEvent[] = [];

      for (const candidate of candidates) {
        const [row] = await tx
          .update(schema.orderOutboxEvents)
          .set({
            status: 'processing',
            attempts: sql`${schema.orderOutboxEvents.attempts} + 1`,
            leaseOwner: input.command.workerId,
            leaseExpiresAt,
            completedAt: null,
            deadAt: null,
          })
          .where(eq(schema.orderOutboxEvents.id, candidate.id))
          .returning();

        if (row === undefined) continue;
        claimed.push(
          claimedOrderOutboxEventFromRow(row, {
            owner: input.command.workerId,
            expiresAt: leaseExpiresAt,
          }),
        );
      }

      return claimed;
    }),
});
