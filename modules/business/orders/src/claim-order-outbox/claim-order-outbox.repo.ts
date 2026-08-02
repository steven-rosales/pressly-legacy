import {
  fulfillmentDemandChangedEventSchema,
  fulfillmentDemandChangedEventType,
} from '@pressly/contracts';
import {
  and,
  asc,
  eq,
  lte,
  or,
  orders as schema,
  sql,
  type Database,
} from '@pressly/db';
import type { OrderOutboxEvent } from '../order-outbox/order-outbox.port.ts';
import type { ClaimOrderOutboxRepository } from './claim-order-outbox.port.ts';

type StoredOrderOutboxEvent = typeof schema.orderOutboxEvents.$inferSelect;

const claimedOrderOutboxEvent = (
  row: StoredOrderOutboxEvent,
  lease: Readonly<{ owner: string; expiresAt: Date }>,
): OrderOutboxEvent => {
  const base = {
    id: row.id,
    orderId: row.orderId,
    fulfillmentId: row.fulfillmentId,
    aggregateVersion: row.aggregateVersion,
    attempts: row.attempts,
    leaseOwner: lease.owner,
    leaseExpiresAt: lease.expiresAt,
  };
  const parsed = fulfillmentDemandChangedEventSchema.safeParse(row.payload);

  if (row.eventType !== fulfillmentDemandChangedEventType)
    return {
      ...base,
      kind: 'invalid',
      eventType: row.eventType,
      payload: row.payload,
      validationError: 'unsupported_event_type',
    };
  if (!parsed.success)
    return {
      ...base,
      kind: 'invalid',
      eventType: row.eventType,
      payload: row.payload,
      validationError: 'invalid_payload',
    };
  if (
    parsed.data.fulfillmentId !== row.fulfillmentId ||
    parsed.data.version !== row.aggregateVersion
  )
    return {
      ...base,
      kind: 'invalid',
      eventType: row.eventType,
      payload: row.payload,
      validationError: 'aggregate_mismatch',
    };
  return {
    ...base,
    kind: 'fulfillment_demand_changed',
    eventType: fulfillmentDemandChangedEventType,
    payload: parsed.data,
  };
};

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
          claimedOrderOutboxEvent(row, {
            owner: input.command.workerId,
            expiresAt: leaseExpiresAt,
          }),
        );
      }

      return claimed;
    }),
});
