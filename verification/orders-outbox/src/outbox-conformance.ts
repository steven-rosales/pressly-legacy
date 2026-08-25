import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { makeOrdersIntegrationSystem } from '@pressly/orders-system/testing/assembly';
import type {
  ClaimedOrderOutboxEvent,
  OrderOutboxBacklog,
} from '@pressly/orders-system/models/order-outbox';
import type {
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxExpectedFailure,
} from '@pressly/orders-system/operations/outbox/claim-order-outbox/types';
import type { CompleteOrderOutboxCommand } from '@pressly/orders-system/operations/outbox/complete-order-outbox/types';
import type { DeadLetterOrderOutboxCommand } from '@pressly/orders-system/operations/outbox/dead-letter-order-outbox/types';
import type { RetryOrderOutboxCommand } from '@pressly/orders-system/operations/outbox/retry-order-outbox/types';

export type OrdersOutboxClock = Readonly<{ now: () => Date }>;

export type OrdersOutboxClaimOutcome =
  | Readonly<{ tag: 'ok'; value: readonly ClaimedOrderOutboxEvent[] }>
  | Readonly<{ tag: 'err'; error: ClaimOrderOutboxExpectedFailure }>;

export type OrdersOutboxDeadLetterOutcome =
  | Readonly<{ tag: 'ok'; value: Readonly<{ deadLettered: boolean }> }>
  | Readonly<{
      tag: 'err';
      error: Readonly<{
        kind: 'validation';
        code: 'order_outbox_dead_letter_invalid';
        message: string;
      }>;
    }>;

export type OrdersOutboxRunner = Readonly<{
  measureOutboxBacklog: () => Promise<OrderOutboxBacklog>;
  claimOutbox: (
    command: ClaimOrderOutboxCommand,
  ) => Promise<OrdersOutboxClaimOutcome>;
  completeOutbox: (
    command: CompleteOrderOutboxCommand,
  ) => Promise<Readonly<{ completed: boolean }>>;
  retryOutbox: (
    command: RetryOrderOutboxCommand,
  ) => Promise<Readonly<{ retried: boolean }>>;
  deadLetterOutbox: (
    command: DeadLetterOrderOutboxCommand,
  ) => Promise<OrdersOutboxDeadLetterOutcome>;
}>;

export const makeOrdersOutboxRunner = (input: {
  db: PostgresDatabase;
  clock: OrdersOutboxClock;
}): OrdersOutboxRunner => {
  const cells = makeOrdersIntegrationSystem({
    ...input,
    schema: presslyPostgresOwnerSchemas.orders,
  }).cells;
  return {
    measureOutboxBacklog: async () => {
      const outcome = await cells.measureOrderOutboxBacklog.execute({});
      if (outcome.kind === 'failure') return outcome.failure;
      return outcome.value;
    },
    claimOutbox: async (command) => {
      const outcome = await cells.claimOrderOutbox.execute(command);
      return outcome.kind === 'success'
        ? { tag: 'ok', value: outcome.value }
        : { tag: 'err', error: outcome.failure };
    },
    completeOutbox: async (command) => {
      const outcome = await cells.completeOrderOutbox.execute(command);
      if (outcome.kind === 'failure') return outcome.failure;
      return outcome.value;
    },
    retryOutbox: async (command) => {
      const outcome = await cells.retryOrderOutbox.execute(command);
      if (outcome.kind === 'failure') return outcome.failure;
      return outcome.value;
    },
    deadLetterOutbox: async (command) => {
      const outcome = await cells.deadLetterOrderOutbox.execute(command);
      return outcome.kind === 'success'
        ? { tag: 'ok', value: outcome.value }
        : { tag: 'err', error: outcome.failure };
    },
  };
};

export type OrdersOutboxDurableRow = Readonly<{
  id: string;
  orderId: string;
  fulfillmentId: string;
  eventType: string;
  aggregateVersion: number;
  payload: unknown;
  status: string;
  attempts: number;
  availableAt: Date;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  completedAt: Date | null;
  deadAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
}>;

export const observeOrdersOutbox = (
  db: PostgresDatabase,
): Promise<readonly OrdersOutboxDurableRow[]> =>
  db
    .select({
      id: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.id,
      orderId: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.orderId,
      fulfillmentId:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.fulfillmentId,
      eventType: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.eventType,
      aggregateVersion:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.aggregateVersion,
      payload: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.payload,
      status: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.status,
      attempts: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.attempts,
      availableAt:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.availableAt,
      leaseOwner:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.leaseOwner,
      leaseExpiresAt:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.leaseExpiresAt,
      completedAt:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.completedAt,
      deadAt: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.deadAt,
      lastErrorCode:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.lastErrorCode,
      lastErrorMessage:
        presslyPostgresOwnerSchemas.orders.orderOutboxEvents.lastErrorMessage,
      createdAt: presslyPostgresOwnerSchemas.orders.orderOutboxEvents.createdAt,
    })
    .from(presslyPostgresOwnerSchemas.orders.orderOutboxEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.orders.orderOutboxEvents.id));
