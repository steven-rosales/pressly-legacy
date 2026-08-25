import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { completeEventCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const eventId = ingressPostgresUuid(100);
const claim = { eventId, workerId: 'worker-1', attempt: 1 };

const seedClaim = () =>
  fixture.insertEvent({
    id: eventId,
    status: 'processing',
    attempts: 1,
    leaseOwner: claim.workerId,
    leaseExpiresAt: new Date(fixture.now().getTime() + 30_000),
  });

proveOperation({
  operationId: 'ingress.complete-event.v1',
  declaration: completeEventCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one fenced completion',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        expect(completeEventCellDeclaration).toMatchObject({
          id: 'ingress.complete-event.v1',
          consistency: { transaction: 'required', concurrency: 'optimistic' },
          emits: [],
        });
        await seedClaim();
        const result = await fixture
          .makeSystem()
          .cells.completeEvent.execute(claim);
        expect(result).toEqual({ kind: 'success', value: 'applied' });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(stored).toMatchObject({
          status: 'processed',
          processedAt: fixture.now(),
          leaseOwner: null,
          leaseExpiresAt: null,
        });
      },
    },

    {
      name: 'rejects stale and replayed claims without mutation',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.completeEvent;
        expect(await cell.execute({ ...claim, attempt: 0 })).toEqual({
          kind: 'success',
          value: 'lease_lost',
        });
        expect(await cell.execute(claim)).toEqual({
          kind: 'success',
          value: 'applied',
        });
        expect(await cell.execute(claim)).toEqual({
          kind: 'success',
          value: 'lease_lost',
        });
      },
    },

    {
      name: 'fences a same-claim completion race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.completeEvent;
        const results = await Promise.all([
          cell.execute(claim),
          cell.execute(claim),
        ]);
        expect(
          results.map((result) => result.kind === 'success' && result.value),
        ).toEqual(expect.arrayContaining(['applied', 'lease_lost']));
      },
    },

    {
      name: 'rolls back an unavailable completion transition',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.completeEvent;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(claim),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_completion_failed',
        });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents);
        expect(stored).toMatchObject({
          status: 'processing',
          leaseOwner: 'worker-1',
        });
      },
    },
  ],
});
