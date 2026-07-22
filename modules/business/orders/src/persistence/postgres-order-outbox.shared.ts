import {
  and,
  asc,
  eq,
  lte,
  or,
  orders as schema,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  fulfillmentDemandChangedEventSchema,
  fulfillmentDemandChangedEventType,
} from '@pressly/contracts';
import type {
  ClaimOrderOutboxCommand,
  CompleteOrderOutboxCommand,
  DeadLetterOrderOutboxCommand,
  OrderOutboxEvent,
  RetryOrderOutboxCommand,
} from '../orders.port.ts';

export const claimStoredOrderOutbox = async (
  db: Database,
  input: { command: ClaimOrderOutboxCommand; now: Date },
): Promise<readonly OrderOutboxEvent[]> =>
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
      const parsed = fulfillmentDemandChangedEventSchema.safeParse(row.payload);
      const base = {
        id: row.id,
        orderId: row.orderId,
        fulfillmentId: row.fulfillmentId,
        aggregateVersion: row.aggregateVersion,
        attempts: row.attempts,
        leaseOwner: input.command.workerId,
        leaseExpiresAt,
      };
      if (row.eventType !== fulfillmentDemandChangedEventType)
        claimed.push({
          ...base,
          kind: 'invalid',
          eventType: row.eventType,
          payload: row.payload,
          validationError: 'unsupported_event_type',
        });
      else if (!parsed.success)
        claimed.push({
          ...base,
          kind: 'invalid',
          eventType: row.eventType,
          payload: row.payload,
          validationError: 'invalid_payload',
        });
      else if (
        parsed.data.fulfillmentId !== row.fulfillmentId ||
        parsed.data.version !== row.aggregateVersion
      )
        claimed.push({
          ...base,
          kind: 'invalid',
          eventType: row.eventType,
          payload: row.payload,
          validationError: 'aggregate_mismatch',
        });
      else
        claimed.push({
          ...base,
          kind: 'fulfillment_demand_changed',
          eventType: fulfillmentDemandChangedEventType,
          payload: parsed.data,
        });
    }
    return claimed;
  });

export const completeStoredOrderOutbox = async (
  db: DatabaseExecutor,
  input: { command: CompleteOrderOutboxCommand; now: Date },
): Promise<boolean> => {
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
};

export const retryStoredOrderOutbox = async (
  db: DatabaseExecutor,
  command: RetryOrderOutboxCommand,
): Promise<boolean> => {
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
};

export const deadLetterStoredOrderOutbox = async (
  db: DatabaseExecutor,
  input: { command: DeadLetterOrderOutboxCommand; now: Date },
): Promise<boolean> => {
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
};
