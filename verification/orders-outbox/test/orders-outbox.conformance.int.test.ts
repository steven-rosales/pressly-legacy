import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  makeOrdersOutboxRunner,
  observeOrdersOutbox,
  type OrdersOutboxRunner,
} from '../src/public.ts';

const databaseUrl = getTestDatabaseUrl(
  'PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_orders_outbox_conformance_test',
);
const resetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_ORDERS_OUTBOX_CONFORMANCE_DATABASE_RESET_URL',
  databaseUrl,
);
const database = createTestDatabaseRuntime({
  databaseUrl,
  resetDatabaseUrl,
  tableNames: ['order_outbox_events', 'order_fulfillments', 'orders'],
  maxConnections: 12,
});
const faultDatabase = createPostgresRuntime({
  databaseUrl: resetDatabaseUrl,
  schema: {},
  maxConnections: 1,
});

const now = new Date('2026-08-22T17:00:00.000Z');
const clock = { now: () => now };
const businessId = '72000000-0000-4000-8000-000000000001';
const orderId = '72000000-0000-4000-8000-000000000002';
const fulfillmentId = '72000000-0000-4000-8000-000000000003';
const locationId = 'orders-outbox-conformance-location';

const eventId = (value: number): string =>
  `72000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const payload = (version: number) => ({
  schemaVersion: 2 as const,
  eventType: 'fulfillment_demand_changed' as const,
  fulfillmentId,
  displayNumber: 'P-720',
  locationId,
  typeCode: 'wash_fold',
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-08-23T20:00:00.000Z',
  estimatedWeightLbs: 21,
  estimatedWeightSource: 'source_estimate',
  version,
  observedAt: '2026-08-22T16:00:00.000Z',
});

const seedOrderAggregate = async (): Promise<void> => {
  await database.db.insert(presslyPostgresOwnerSchemas.orders.orders).values({
    id: orderId,
    businessId,
    customerResolution: 'not_provided',
    dueAt: new Date('2026-08-23T20:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
  });
  await database.db
    .insert(presslyPostgresOwnerSchemas.orders.orderFulfillments)
    .values({
      id: fulfillmentId,
      businessId,
      orderId,
      typeCode: 'wash_fold',
      locationId,
      releaseState: 'released',
      estimatedWeightLbs: 21,
      estimatedWeightSource: 'source_estimate',
      createdAt: now,
      updatedAt: now,
    });
};

type EventFixture = Readonly<{
  index: number;
  version: number;
  eventType?: string;
  storedPayload?: unknown;
  status?: 'pending' | 'processing' | 'completed' | 'dead';
  attempts?: number;
  availableAt?: Date;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  completedAt?: Date | null;
  deadAt?: Date | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  createdAt?: Date;
}>;

const insertEvent = async (fixture: EventFixture): Promise<string> => {
  const id = eventId(fixture.index);
  await database.db
    .insert(presslyPostgresOwnerSchemas.orders.orderOutboxEvents)
    .values({
      id,
      orderId,
      fulfillmentId,
      eventType: fixture.eventType ?? 'fulfillment_demand_changed',
      aggregateVersion: fixture.version,
      payload: fixture.storedPayload ?? payload(fixture.version),
      status: fixture.status ?? 'pending',
      attempts: fixture.attempts ?? 0,
      availableAt: fixture.availableAt ?? now,
      leaseOwner: fixture.leaseOwner ?? null,
      leaseExpiresAt: fixture.leaseExpiresAt ?? null,
      completedAt: fixture.completedAt ?? null,
      deadAt: fixture.deadAt ?? null,
      lastErrorCode: fixture.lastErrorCode ?? null,
      lastErrorMessage: fixture.lastErrorMessage ?? null,
      createdAt: fixture.createdAt ?? now,
    });
  return id;
};

type ScenarioContext = Readonly<{
  runner: OrdersOutboxRunner;
  insertEvent: typeof insertEvent;
}>;

type Observation<Value> = Readonly<{
  before: Awaited<ReturnType<typeof observeOrdersOutbox>>;
  value: Value;
  after: Awaited<ReturnType<typeof observeOrdersOutbox>>;
}>;

const observeScenario = async <Value>(
  prepare: (context: Omit<ScenarioContext, 'runner'>) => Promise<void>,
  act: (context: ScenarioContext) => Promise<Value>,
): Promise<Observation<Value>> => {
  await database.reset();
  await seedOrderAggregate();
  await prepare({ insertEvent });
  const runner = makeOrdersOutboxRunner({ db: database.db, clock });
  const before = await observeOrdersOutbox(database.db);
  const value = await act({ runner, insertEvent });
  const after = await observeOrdersOutbox(database.db);
  return { before, value, after };
};

beforeAll(async () => {
  await Promise.all([database.check(), faultDatabase.check()]);
});
afterAll(async () => {
  try {
    await database.reset();
  } finally {
    await Promise.all([database.close(), faultDatabase.close()]);
  }
});

describe('Orders-system outbox conformance', () => {
  it('preserves exact unexpected persistence failure presentation for all five operations', async () => {
    await database.reset();
    await seedOrderAggregate();
    const runner = makeOrdersOutboxRunner({ db: database.db, clock });
    const capture = async (action: () => Promise<unknown>) => {
      await faultDatabase.db.execute(
        sql`alter table order_outbox_events rename to order_outbox_events_fault`,
      );
      try {
        await action();
        return { unexpected: 'success' };
      } catch (error) {
        if (typeof error !== 'object' || error === null)
          return { unexpected: error };
        return Object.fromEntries(
          ['tag', 'kind', 'code', 'message', 'safeMessage', 'status'].map(
            (key) => [key, Reflect.get(error, key)],
          ),
        );
      } finally {
        await faultDatabase.db.execute(
          sql`alter table order_outbox_events_fault rename to order_outbox_events`,
        );
      }
    };

    const observed = {
      measure: await capture(() => runner.measureOutboxBacklog()),
      claim: await capture(() =>
        runner.claimOutbox({
          workerId: 'worker-1',
          limit: 10,
          leaseMs: 30_000,
        }),
      ),
      complete: await capture(() =>
        runner.completeOutbox({
          eventId: eventId(1),
          workerId: 'worker-1',
        }),
      ),
      retry: await capture(() =>
        runner.retryOutbox({
          eventId: eventId(1),
          workerId: 'worker-1',
          availableAt: now,
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        }),
      ),
      deadLetter: await capture(() =>
        runner.deadLetterOutbox({
          eventId: eventId(1),
          workerId: 'worker-1',
          errorCode: 'invalid_event',
          errorMessage: 'Invalid durable event.',
        }),
      ),
    };

    expect(observed).toMatchObject({
      measure: {
        kind: 'DatabaseError',
        code: 'order_outbox_backlog_measurement_failed',
        status: 503,
      },
      claim: {
        kind: 'DatabaseError',
        code: 'order_outbox_claim_failed',
        status: 503,
      },
      complete: {
        kind: 'DatabaseError',
        code: 'order_outbox_completion_failed',
        status: 503,
      },
      retry: {
        kind: 'DatabaseError',
        code: 'order_outbox_retry_failed',
        status: 503,
      },
      deadLetter: {
        kind: 'DatabaseError',
        code: 'order_outbox_dead_letter_failed',
        status: 503,
      },
    });
  });

  it('preserves empty and mixed pending/processing backlog creation-age semantics', async () => {
    const empty = await observeScenario(
      async () => undefined,
      ({ runner }) => runner.measureOutboxBacklog(),
    );
    expect(empty.value).toEqual({
      pendingCount: 0,
      oldestPendingAgeSeconds: 0,
    });

    const mixed = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 10,
          version: 1,
          status: 'pending',
          createdAt: new Date('2026-08-22T16:55:00.000Z'),
        });
        await insert({
          index: 11,
          version: 2,
          status: 'processing',
          leaseOwner: 'worker-active',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
          createdAt: new Date('2026-08-22T16:50:00.000Z'),
        });
        await insert({
          index: 12,
          version: 3,
          status: 'completed',
          completedAt: now,
          createdAt: new Date('2026-08-22T15:00:00.000Z'),
        });
        await insert({
          index: 13,
          version: 4,
          status: 'dead',
          deadAt: now,
          createdAt: new Date('2026-08-22T14:00:00.000Z'),
        });
      },
      ({ runner }) => runner.measureOutboxBacklog(),
    );
    expect(mixed.value).toEqual({
      pendingCount: 2,
      oldestPendingAgeSeconds: 600,
    });
    expect(mixed.after).toEqual(mixed.before);
  });

  it('preserves availableAt ordering, limit, attempt increment, expiry reclaim, and exclusions', async () => {
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 20,
          version: 1,
          availableAt: new Date('2026-08-22T16:55:00.000Z'),
        });
        await insert({
          index: 21,
          version: 2,
          status: 'processing',
          attempts: 4,
          availableAt: new Date('2026-08-22T16:56:00.000Z'),
          leaseOwner: 'worker-stale',
          leaseExpiresAt: now,
        });
        await insert({
          index: 22,
          version: 3,
          availableAt: new Date('2026-08-22T16:57:00.000Z'),
        });
        await insert({
          index: 23,
          version: 4,
          availableAt: new Date('2026-08-22T17:00:00.001Z'),
        });
        await insert({
          index: 24,
          version: 5,
          status: 'processing',
          leaseOwner: 'worker-active',
          leaseExpiresAt: new Date('2026-08-22T17:00:00.001Z'),
        });
      },
      ({ runner }) =>
        runner.claimOutbox({
          workerId: 'worker-1',
          limit: 2,
          leaseMs: 30_000,
        }),
    );
    expect(observation.value).toMatchObject({
      tag: 'ok',
      value: [
        { id: eventId(20), attempts: 1, leaseOwner: 'worker-1' },
        { id: eventId(21), attempts: 5, leaseOwner: 'worker-1' },
      ],
    });
    expect(
      observation.after.filter((event) => event.status === 'processing'),
    ).toHaveLength(3);
  });

  it('preserves unsupported, malformed, and aggregate-mismatched claimed deliveries', async () => {
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 30,
          version: 1,
          eventType: 'unsupported',
          storedPayload: { ignored: true },
        });
        await insert({
          index: 31,
          version: 2,
          storedPayload: { ...payload(2), dueAt: 'not-a-date' },
        });
        await insert({
          index: 32,
          version: 3,
          storedPayload: payload(4),
        });
      },
      ({ runner }) =>
        runner.claimOutbox({
          workerId: 'worker-1',
          limit: 10,
          leaseMs: 30_000,
        }),
    );
    expect(observation.value).toMatchObject({
      tag: 'ok',
      value: [
        { validationError: 'unsupported_event_type' },
        { validationError: 'invalid_payload' },
        { validationError: 'aggregate_mismatch' },
      ],
    });
    expect(
      observation.after.every(
        (event) =>
          event.status === 'processing' &&
          event.attempts === 1 &&
          event.leaseOwner === 'worker-1',
      ),
    ).toBe(true);
  });

  it('preserves two-worker SKIP LOCKED safety independent of worker scheduling', async () => {
    const canonical = (input: {
      outcomes: readonly Awaited<
        ReturnType<OrdersOutboxRunner['claimOutbox']>
      >[];
      rows: Awaited<ReturnType<typeof observeOrdersOutbox>>;
    }) => {
      const batches = input.outcomes.map((outcome) =>
        outcome.tag === 'ok'
          ? outcome.value.map((event) => event.id).sort()
          : ['failure'],
      );
      return {
        batchSizes: batches.map((batch) => batch.length).sort(),
        claimedIds: batches.flat().sort(),
        durable: input.rows.map((row) => ({
          ...row,
          leaseOwner: row.leaseOwner === null ? null : 'claimed-worker',
        })),
      };
    };

    await database.reset();
    await seedOrderAggregate();
    for (let index = 40; index < 46; index += 1)
      await insertEvent({
        index,
        version: index - 39,
        availableAt: new Date(now.getTime() - 1_000 + index),
      });
    const first = makeOrdersOutboxRunner({ db: database.db, clock });
    const second = makeOrdersOutboxRunner({ db: database.db, clock });
    const outcomes = await Promise.all([
      first.claimOutbox({
        workerId: 'worker-a',
        limit: 3,
        leaseMs: 30_000,
      }),
      second.claimOutbox({
        workerId: 'worker-b',
        limit: 3,
        leaseMs: 30_000,
      }),
    ]);
    const result = canonical({
      outcomes,
      rows: await observeOrdersOutbox(database.db),
    });
    expect(result).toMatchObject({ batchSizes: [3, 3] });
    expect(new Set(result.claimedIds).size).toBe(6);
  });

  it('preserves typed claim and dead-letter validation without durable effects', async () => {
    const invalidClaim = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({ index: 50, version: 1 });
      },
      ({ runner }) =>
        runner.claimOutbox({ workerId: ' ', limit: 10, leaseMs: 30_000 }),
    );
    expect(invalidClaim.value).toEqual({
      tag: 'err',
      error: {
        kind: 'validation',
        code: 'order_outbox_claim_invalid',
        message: 'The outbox claim request is invalid.',
      },
    });
    expect(invalidClaim.after).toEqual(invalidClaim.before);

    const invalidDeadLetter = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 51,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
        });
      },
      ({ runner }) =>
        runner.deadLetterOutbox({
          eventId: eventId(51),
          workerId: 'worker-1',
          errorCode: ' ',
          errorMessage: 'Invalid durable event.',
        }),
    );
    expect(invalidDeadLetter.value).toEqual({
      tag: 'err',
      error: {
        kind: 'validation',
        code: 'order_outbox_dead_letter_invalid',
        message: 'The outbox dead-letter request is invalid.',
      },
    });
    expect(invalidDeadLetter.after).toEqual(invalidDeadLetter.before);
  });

  it('preserves stale owner no-ops for complete, retry, and dead-letter', async () => {
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 60,
          version: 1,
          status: 'processing',
          attempts: 7,
          leaseOwner: 'worker-current',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
        });
      },
      async ({ runner }) => ({
        complete: await runner.completeOutbox({
          eventId: eventId(60),
          workerId: 'worker-stale',
        }),
        retry: await runner.retryOutbox({
          eventId: eventId(60),
          workerId: 'worker-stale',
          availableAt: new Date('2026-08-22T17:01:00.000Z'),
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        }),
        deadLetter: await runner.deadLetterOutbox({
          eventId: eventId(60),
          workerId: 'worker-stale',
          errorCode: 'invalid_event',
          errorMessage: 'Invalid durable event.',
        }),
      }),
    );
    expect(observation.value).toEqual({
      complete: { completed: false },
      retry: { retried: false },
      deadLetter: { tag: 'ok', value: { deadLettered: false } },
    });
    expect(observation.after).toEqual(observation.before);
  });

  it('preserves successful completion and retains the attempt counter', async () => {
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 70,
          version: 1,
          status: 'processing',
          attempts: 4,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
          lastErrorCode: 'old_error',
          lastErrorMessage: 'Old error.',
        });
      },
      ({ runner }) =>
        runner.completeOutbox({
          eventId: eventId(70),
          workerId: 'worker-1',
        }),
    );
    expect(observation.value).toEqual({ completed: true });
    expect(observation.after).toMatchObject([
      {
        status: 'completed',
        attempts: 4,
        leaseOwner: null,
        completedAt: now,
        deadAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    ]);
  });

  it('preserves successful retry and its exact durable reschedule/error delta', async () => {
    const availableAt = new Date('2026-08-22T17:02:00.000Z');
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 80,
          version: 1,
          status: 'processing',
          attempts: 3,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
        });
      },
      ({ runner }) =>
        runner.retryOutbox({
          eventId: eventId(80),
          workerId: 'worker-1',
          availableAt,
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        }),
    );
    expect(observation.value).toEqual({ retried: true });
    expect(observation.after).toMatchObject([
      {
        status: 'pending',
        attempts: 3,
        availableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadAt: null,
        lastErrorCode: 'temporary_failure',
        lastErrorMessage: 'Temporary downstream failure.',
      },
    ]);
  });

  it('preserves successful dead-letter and makes the row unclaimable', async () => {
    const observation = await observeScenario(
      async ({ insertEvent: insert }) => {
        await insert({
          index: 90,
          version: 1,
          status: 'processing',
          attempts: 8,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T17:05:00.000Z'),
        });
      },
      async ({ runner }) => ({
        deadLetter: await runner.deadLetterOutbox({
          eventId: eventId(90),
          workerId: 'worker-1',
          errorCode: 'invalid_event',
          errorMessage: 'Invalid durable event.',
        }),
        nextClaim: await runner.claimOutbox({
          workerId: 'worker-2',
          limit: 10,
          leaseMs: 30_000,
        }),
      }),
    );
    expect(observation.value).toEqual({
      deadLetter: { tag: 'ok', value: { deadLettered: true } },
      nextClaim: { tag: 'ok', value: [] },
    });
    expect(observation.after).toMatchObject([
      {
        status: 'dead',
        attempts: 8,
        leaseOwner: null,
        leaseExpiresAt: null,
        completedAt: null,
        deadAt: now,
        lastErrorCode: 'invalid_event',
        lastErrorMessage: 'Invalid durable event.',
      },
    ]);
  });
});
