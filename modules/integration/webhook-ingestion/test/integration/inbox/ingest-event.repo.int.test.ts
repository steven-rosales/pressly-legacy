import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresWebhookIngestionApplication } from '../../../src/main.ts';

const runtime = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['webhook_events'],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

const application = makePostgresWebhookIngestionApplication({
  db: runtime.db,
  clock: { now: () => new Date('2026-08-08T12:00:00.000Z') },
  ids: { next: () => crypto.randomUUID() },
});

beforeAll(runtime.check);
beforeEach(runtime.reset);
afterAll(runtime.close);

const originalCommand = {
  source: 'cents',
  eventType: 'order_updated',
  deduplicationKey: 'a'.repeat(64),
  subjectType: 'order',
  subjectId: 'external-order',
  sourceLocationId: 'external-store',
  sourceOccurredAt: new Date('2026-07-20T13:00:00.000Z'),
  payload: {
    externalOrderId: 'external-order',
    sourceSnapshot: { status: 'COMPLETED' },
  },
  rawBodySha256: 'b'.repeat(64),
  disposition: 'process' as const,
};

describe('Postgres webhook event ingestion', () => {
  it('acknowledges exact raw redelivery after normalized fields evolve', async () => {
    const original = await application.ingestEvent(originalCommand);

    const redelivery = await application.ingestEvent({
      ...originalCommand,
      subjectType: 'unknown',
      subjectId: null,
      sourceLocationId: null,
      sourceOccurredAt: null,
      payload: null,
      disposition: 'ignore',
    });

    expect(original.value.duplicate).toBe(false);
    expect(redelivery.value).toEqual({
      eventId: original.value.eventId,
      duplicate: true,
      status: 'ignored',
    });
  });

  it('rejects one deduplication identity that refers to different raw data', async () => {
    await application.ingestEvent(originalCommand);

    await expect(
      application.ingestEvent({
        ...originalCommand,
        rawBodySha256: 'c'.repeat(64),
      }),
    ).rejects.toMatchObject({
      code: 'webhook_event_duplicate_diverged',
      kind: 'InvariantViolationError',
    });
  });
});
