import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { webhookEventReadyV1MessageContract } from '../../../contracts/webhook-event-ready-v1.ts';
import { installIngressPostgresFixture } from '../../../testing/postgres-fixture.ts';
import { ingestEventCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const command = {
  source: 'cents',
  eventType: 'order_updated',
  deduplicationKey: 'a'.repeat(64),
  subjectType: 'order',
  subjectId: 'order-1',
  sourceLocationId: 'store-1',
  sourceOccurredAt: new Date('2026-08-22T15:00:00.000Z'),
  payload: { orderId: 'order-1', status: 'SUBMITTED' },
  rawBodySha256: 'b'.repeat(64),
  disposition: 'process' as const,
};

proveOperation({
  operationId: 'ingress.ingest-event.v1',
  declaration: ingestEventCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits the durable inbox source for one ready message',
      proves: [
        'contract',
        'executor-success',
        'postgres-commit',
        'message-compatibility',
        'state-message-atomicity',
      ],
      run: async () => {
        expect(ingestEventCellDeclaration).toMatchObject({
          id: 'ingress.ingest-event.v1',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: true },
          emits: [webhookEventReadyV1MessageContract],
        });
        const result = await fixture
          .makeSystem()
          .cells.ingestEvent.execute(command);
        expect(result).toMatchObject({
          kind: 'success',
          value: { duplicate: false, status: 'pending' },
        });
        const eventId = result.kind === 'success' ? result.value.eventId : '';
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(stored).toMatchObject({
          status: 'pending',
          attempts: 0,
          payload: command.payload,
          payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
          rawBodySha256: command.rawBodySha256,
        });
      },
    },

    {
      name: 'commits an approved no-op as non-claimable state',
      proves: ['postgres-commit'],
      run: async () => {
        const result = await fixture.makeSystem().cells.ingestEvent.execute({
          ...command,
          deduplicationKey: 'c'.repeat(64),
          payload: null,
          disposition: 'ignore',
        });
        const eventId = result.kind === 'success' ? result.value.eventId : '';
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(result).toMatchObject({
          kind: 'success',
          value: { duplicate: false, status: 'ignored' },
        });
        expect(stored).toMatchObject({
          status: 'processed',
          payload: null,
          payloadHash: null,
          processedAt: fixture.now(),
        });
      },
    },

    {
      name: 'replays exact bytes and rejects a divergent deduplication key',
      proves: [
        'same-payload-replay',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        const cell = fixture.makeSystem().cells.ingestEvent;
        const first = await cell.execute(command);
        const replay = await cell.execute({
          ...command,
          subjectType: 'unknown',
          subjectId: null,
          sourceLocationId: null,
          sourceOccurredAt: null,
          payload: null,
          disposition: 'ignore',
        });
        await expect(
          cell.execute({ ...command, rawBodySha256: 'd'.repeat(64) }),
        ).rejects.toMatchObject({ code: 'webhook_event_duplicate_diverged' });
        expect(replay).toMatchObject({
          kind: 'success',
          value: {
            eventId: first.kind === 'success' ? first.value.eventId : undefined,
            duplicate: true,
            status: 'ignored',
          },
        });
        const rows = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          subjectType: command.subjectType,
          payload: command.payload,
          status: 'pending',
        });
      },
    },

    {
      name: 'serializes a same-key inbox race',
      proves: ['same-key-concurrency', 'declared-concurrency-race'],
      run: async () => {
        const cell = fixture.makeSystem().cells.ingestEvent;
        const results = await Promise.all([
          cell.execute(command),
          cell.execute(command),
        ]);
        expect(
          results.map((result) =>
            result.kind === 'success' ? result.value.duplicate : 'failure',
          ),
        ).toEqual(expect.arrayContaining([false, true]));
        expect(
          await fixture.db.select().from(fixture.schema.webhookEvents),
        ).toHaveLength(1);
      },
    },

    {
      name: 'rolls back when inbox persistence is unavailable',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        const cell = fixture.makeSystem().cells.ingestEvent;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(command),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_ingestion_failed',
        });
        expect(
          await fixture.db.select().from(fixture.schema.webhookEvents),
        ).toEqual([]);
      },
    },
  ],
});
