import { webhookIngestion } from '@pressly/db';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresWebhookIngestionApplication } from '../../src/main.ts';

const runtime = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['webhook_events'],
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});
let now = new Date('2026-07-10T14:00:00.000Z');
const application = makePostgresWebhookIngestionApplication({
  db: runtime.db,
  clock: { now: () => new Date(now) },
  ids: { next: () => crypto.randomUUID() },
});

beforeAll(runtime.check);
beforeEach(async () => {
  now = new Date('2026-07-10T14:00:00.000Z');
  await runtime.reset();
});

afterAll(runtime.close);

const insertEvent = async (input: {
  eventId: string;
  status: 'pending' | 'processing';
  availableAt: string;
  leaseExpiresAt?: string;
}) => {
  const id = crypto.randomUUID();
  await runtime.db.insert(webhookIngestion.webhookEvents).values({
    id,
    source: 'cents',
    eventType: 'order_updated',
    dedupeKey: `event-${input.eventId}`,
    subjectType: 'order',
    subjectId: input.eventId,
    sourceLocationId: 'store-1',
    sourceOccurredAt: new Date('2026-07-10T13:00:00.000Z'),
    payload: {},
    payloadHash: 'a'.repeat(64),
    rawBodySha256: 'b'.repeat(64),
    status: input.status,
    availableAt: new Date(input.availableAt),
    leaseOwner: input.status === 'processing' ? 'crashed-worker' : null,
    leaseExpiresAt:
      input.leaseExpiresAt === undefined
        ? null
        : new Date(input.leaseExpiresAt),
  });
  return id;
};

describe('Postgres webhook event claims', () => {
  it('reclaims a crash-after-claim row only after its lease expires', async () => {
    await insertEvent({
      eventId: 'expired',
      status: 'processing',
      availableAt: '2026-07-10T13:00:00.000Z',
      leaseExpiresAt: '2026-07-10T13:59:59.999Z',
    });
    await insertEvent({
      eventId: 'still-leased',
      status: 'processing',
      availableAt: '2026-07-10T13:00:00.000Z',
      leaseExpiresAt: '2026-07-10T14:01:00.000Z',
    });

    const first = await application.claimEvents({
      workerId: 'worker-2',
      leaseMs: 30_000,
      limit: 10,
    });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ attempt: 1, recoveredLease: true });

    await expect(
      application.claimEvents({
        workerId: 'worker-3',
        leaseMs: 30_000,
        limit: 10,
      }),
    ).resolves.toEqual([]);

    now = new Date('2026-07-10T14:00:30.001Z');
    await expect(
      application.claimEvents({
        workerId: 'worker-3',
        leaseMs: 30_000,
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        eventId: first[0]?.eventId,
        attempt: 2,
        recoveredLease: true,
      }),
    ]);
  });

  it('uses skip-locked claims so concurrent workers receive distinct rows', async () => {
    await insertEvent({
      eventId: 'pending-1',
      status: 'pending',
      availableAt: '2026-07-10T13:00:00.000Z',
    });
    await insertEvent({
      eventId: 'pending-2',
      status: 'pending',
      availableAt: '2026-07-10T13:00:00.000Z',
    });

    const [left, right] = await Promise.all([
      application.claimEvents({
        workerId: 'left',
        leaseMs: 30_000,
        limit: 1,
      }),
      application.claimEvents({
        workerId: 'right',
        leaseMs: 30_000,
        limit: 1,
      }),
    ]);
    expect(
      new Set([...left, ...right].map((event) => event.eventId)).size,
    ).toBe(2);
    expect([...left, ...right].every((event) => !event.recoveredLease)).toBe(
      true,
    );
  });

  it('lease-fences success, retry, and dead-letter completion', async () => {
    const ids = await Promise.all(
      ['processed', 'dead', 'pending'].map((eventId) =>
        insertEvent({
          eventId,
          status: 'pending',
          availableAt: '2026-07-10T13:00:00.000Z',
        }),
      ),
    );
    const firstClaims = await application.claimEvents({
      workerId: 'worker-1',
      leaseMs: 30_000,
      limit: 10,
    });
    now = new Date('2026-07-10T14:00:30.001Z');
    const secondClaims = await application.claimEvents({
      workerId: 'worker-2',
      leaseMs: 30_000,
      limit: 10,
    });
    const claimFor = (
      claims: typeof firstClaims,
      eventId: string,
    ): (typeof claims)[number] => {
      const claim = claims.find((candidate) => candidate.eventId === eventId);
      if (claim === undefined) throw new Error(`Missing claim for ${eventId}.`);
      return claim;
    };

    const stale = ids.map((id) => claimFor(firstClaims, id));
    const current = ids.map((id) => claimFor(secondClaims, id));
    await expect(application.completeEvent(current[0]!)).resolves.toBe(
      'applied',
    );
    await expect(
      application.deadLetterEvent({
        ...current[1]!,
        code: 'new-worker-dead',
        message: 'new worker chose dead',
      }),
    ).resolves.toBe('applied');
    const availableAt = new Date('2026-07-10T14:05:00.000Z');
    await expect(
      application.retryEvent({
        ...current[2]!,
        availableAt,
        code: 'new-worker-retry',
        message: 'new worker chose retry',
      }),
    ).resolves.toBe('applied');

    await expect(application.completeEvent(stale[0]!)).resolves.toBe(
      'lease_lost',
    );
    await expect(
      application.retryEvent({
        ...stale[1]!,
        availableAt: now,
        code: 'stale-retry',
        message: 'must not regress dead',
      }),
    ).resolves.toBe('lease_lost');
    await expect(
      application.deadLetterEvent({
        ...stale[2]!,
        code: 'stale-dead',
        message: 'must not regress pending',
      }),
    ).resolves.toBe('lease_lost');
  });
});
