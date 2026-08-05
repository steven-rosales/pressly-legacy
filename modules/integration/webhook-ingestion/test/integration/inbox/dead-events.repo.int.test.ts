import { eq } from '@pressly/db/query';
import * as webhookIngestion from '@pressly/db/schema/webhook-ingestion';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresListDeadWebhookEventsRepository } from '../../../src/features/inbox/list-dead-events/list-dead-events.repo.ts';
import { makePostgresReplayDeadWebhookEventRepository } from '../../../src/features/inbox/replay-dead-event/replay-dead-event.repo.ts';

const runtime = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['webhook_events'],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

beforeAll(runtime.check);
beforeEach(runtime.reset);
afterAll(runtime.close);

const eventId = (suffix: number): string =>
  `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const insertEvent = async (input: {
  id: string;
  source: string;
  status: 'dead' | 'pending' | 'processed' | 'processing';
  attempts?: number;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
}) => {
  await runtime.db.insert(webhookIngestion.webhookEvents).values({
    id: input.id,
    source: input.source,
    eventType: 'order_updated',
    dedupeKey: `event-${input.id}`,
    subjectType: 'order',
    subjectId: `order-${input.id}`,
    sourceLocationId: 'store-1',
    sourceOccurredAt: new Date('2026-08-05T12:00:00.000Z'),
    payload: { private: 'not part of the dead-event projection' },
    payloadHash: 'a'.repeat(64),
    rawBodySha256: 'b'.repeat(64),
    status: input.status,
    attempts: input.attempts ?? 0,
    availableAt: new Date('2026-08-05T12:01:00.000Z'),
    leaseOwner: input.leaseOwner ?? null,
    leaseExpiresAt: input.leaseExpiresAt ?? null,
    lastErrorCode: input.lastErrorCode ?? null,
    lastErrorMessage: input.lastErrorMessage ?? null,
    receivedAt: new Date('2026-08-05T12:02:00.000Z'),
  });
};

describe('dead webhook event Postgres repositories', () => {
  it('lists only dead events with source, cursor, ordering, and limit applied', async () => {
    const ids = [eventId(1), eventId(2), eventId(3), eventId(4)] as const;
    await insertEvent({ id: ids[0], source: 'cents', status: 'dead' });
    await insertEvent({ id: ids[1], source: 'another-source', status: 'dead' });
    await insertEvent({ id: ids[2], source: 'cents', status: 'pending' });
    await insertEvent({
      id: ids[3],
      source: 'cents',
      status: 'dead',
      attempts: 3,
      lastErrorCode: 'source_location_unmapped',
      lastErrorMessage: 'private diagnostic',
    });
    const list = makePostgresListDeadWebhookEventsRepository(runtime.db);

    const afterFirst = await list({ afterEventId: ids[0], limit: 2 });
    expect(afterFirst.map(({ eventId: id }) => id)).toEqual([ids[1], ids[3]]);

    const cents = await list({ source: 'cents', limit: 10 });
    expect(cents.map(({ eventId: id }) => id)).toEqual([ids[0], ids[3]]);
    expect(cents[1]).toMatchObject({
      attempts: 3,
      lastErrorCode: 'source_location_unmapped',
    });
    expect(cents[1]).not.toHaveProperty('payload');
    expect(cents[1]).not.toHaveProperty('lastErrorMessage');
  });

  it('requeues a dead event and clears only retry-control state', async () => {
    const id = eventId(10);
    const replayedAt = new Date('2026-08-05T14:00:00.000Z');
    await insertEvent({
      id,
      source: 'cents',
      status: 'dead',
      attempts: 3,
      lastErrorCode: 'projection_failed',
      lastErrorMessage: 'private diagnostic',
      leaseOwner: 'failed-worker',
      leaseExpiresAt: new Date('2026-08-05T13:00:00.000Z'),
    });
    const replay = makePostgresReplayDeadWebhookEventRepository(runtime.db);

    await expect(replay(id, replayedAt)).resolves.toBe('queued');

    const [stored] = await runtime.db
      .select()
      .from(webhookIngestion.webhookEvents)
      .where(eq(webhookIngestion.webhookEvents.id, id));
    expect(stored).toMatchObject({
      status: 'pending',
      attempts: 3,
      availableAt: replayedAt,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
  });
});
