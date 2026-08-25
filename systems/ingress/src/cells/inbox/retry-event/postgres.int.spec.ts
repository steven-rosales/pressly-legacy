import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { retryEventCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const eventId = ingressPostgresUuid(110);
const retryAt = new Date('2026-08-22T16:05:00.000Z');
const command = {
  eventId,
  workerId: 'worker-1',
  attempt: 1,
  availableAt: retryAt,
  code: 'projection_pending',
  message: 'retry later',
};

const seedClaim = () =>
  fixture.insertEvent({
    id: eventId,
    status: 'processing',
    attempts: 1,
    leaseOwner: command.workerId,
    leaseExpiresAt: new Date(fixture.now().getTime() + 30_000),
  });

proveOperation({
  operationId: 'ingress.retry-event.v1',
  declaration: retryEventCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one fenced retry schedule',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        expect(retryEventCellDeclaration).toMatchObject({
          id: 'ingress.retry-event.v1',
          consistency: { transaction: 'required', concurrency: 'optimistic' },
          emits: [],
        });
        await seedClaim();
        expect(
          await fixture.makeSystem().cells.retryEvent.execute(command),
        ).toEqual({
          kind: 'success',
          value: 'applied',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(stored).toMatchObject({
          status: 'pending',
          availableAt: retryAt,
          leaseOwner: null,
          lastErrorCode: command.code,
          lastErrorMessage: command.message,
        });
      },
    },

    {
      name: 'rejects stale and replayed retry fences without mutation',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.retryEvent;
        expect(await cell.execute({ ...command, workerId: 'other' })).toEqual({
          kind: 'success',
          value: 'lease_lost',
        });
        expect(await cell.execute(command)).toEqual({
          kind: 'success',
          value: 'applied',
        });
        expect(await cell.execute(command)).toEqual({
          kind: 'success',
          value: 'lease_lost',
        });
      },
    },

    {
      name: 'fences a divergent retry race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.retryEvent;
        const results = await Promise.all([
          cell.execute(command),
          cell.execute({ ...command, code: 'different' }),
        ]);
        expect(
          results.map((result) => result.kind === 'success' && result.value),
        ).toEqual(expect.arrayContaining(['applied', 'lease_lost']));
      },
    },

    {
      name: 'rolls back an unavailable retry transition',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.retryEvent;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(command),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_retry_failed',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(stored).toMatchObject({
          status: 'processing',
          lastErrorCode: null,
        });
      },
    },
  ],
});
