import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { replayDeadEventCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const eventId = ingressPostgresUuid(400);

proveOperation({
  operationId: 'ingress.replay-dead-event.v1',
  declaration: replayDeadEventCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits a protocol-declared replay and resets delivery controls',
      proves: ['contract', 'executor-success', 'protocol', 'postgres-commit'],
      run: async () => {
        expect(replayDeadEventCellDeclaration).toMatchObject({
          id: 'ingress.replay-dead-event.v1',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          emits: [],
        });
        await fixture.insertEvent({
          id: eventId,
          status: 'dead',
          attempts: 8,
          leaseOwner: 'old-worker',
          leaseExpiresAt: new Date('2026-08-22T15:30:00.000Z'),
          lastErrorCode: 'projection_failed',
          lastErrorMessage: 'private diagnostic',
        });
        expect(
          await fixture.makeSystem().cells.replayDeadEvent.execute({ eventId }),
        ).toEqual({
          kind: 'success',
          value: { eventId, outcome: 'queued' },
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(stored).toMatchObject({
          status: 'pending',
          attempts: 8,
          availableAt: fixture.now(),
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        });
      },
    },

    {
      name: 'decides exact replay and typed terminal or missing rejection',
      proves: [
        'decision',
        'same-payload-replay',
        'divergent-key-conflict',
        'expected-rejection-no-partial-write',
      ],
      run: async () => {
        await fixture.insertEvent({ id: eventId, status: 'pending' });
        await fixture.insertEvent({
          id: ingressPostgresUuid(401),
          status: 'processed',
          processedAt: fixture.now(),
        });
        const cell = fixture.makeSystem().cells.replayDeadEvent;
        expect(await cell.execute({ eventId })).toEqual({
          kind: 'success',
          value: { eventId, outcome: 'already_queued' },
        });
        await expect(
          cell.execute({ eventId: ingressPostgresUuid(401) }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'webhook_event_not_replayable' },
        });
        await expect(
          cell.execute({ eventId: ingressPostgresUuid(999) }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { code: 'webhook_event_not_found' },
        });
      },
    },

    {
      name: 'serializes a same-event replay race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await fixture.insertEvent({ id: eventId, status: 'dead' });
        const cell = fixture.makeSystem().cells.replayDeadEvent;
        const results = await Promise.all([
          cell.execute({ eventId }),
          cell.execute({ eventId }),
        ]);
        expect(
          results.map((result) =>
            result.kind === 'success' ? result.value.outcome : 'failure',
          ),
        ).toEqual(expect.arrayContaining(['queued', 'already_queued']));
      },
    },

    {
      name: 'rolls back an unavailable replay transition',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await fixture.insertEvent({ id: eventId, status: 'dead' });
        const cell = fixture.makeSystem().cells.replayDeadEvent;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute({ eventId }),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'dead_webhook_event_replay_failed',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(stored).toMatchObject({ status: 'dead' });
      },
    },
  ],
});
