import { eq } from '@pressly/postgres/query';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  ingressPostgresUuid,
  installIngressPostgresFixture,
} from '../../../testing/postgres-fixture.ts';
import { deadLetterEventCellDeclaration } from './cell.ts';

const fixture = installIngressPostgresFixture();
const eventId = ingressPostgresUuid(120);
const command = {
  eventId,
  workerId: 'worker-1',
  attempt: 1,
  code: 'terminal_projection_failure',
  message: 'terminal failure',
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
  operationId: 'ingress.dead-letter-event.v1',
  declaration: deadLetterEventCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'commits one fenced terminal diagnostic',
      proves: ['contract', 'executor-success', 'postgres-commit'],
      run: async () => {
        expect(deadLetterEventCellDeclaration).toMatchObject({
          id: 'ingress.dead-letter-event.v1',
          consistency: { transaction: 'required', concurrency: 'optimistic' },
          emits: [],
        });
        await seedClaim();
        expect(
          await fixture.makeSystem().cells.deadLetterEvent.execute(command),
        ).toEqual({ kind: 'success', value: 'applied' });
        const [stored] = await fixture.db
          .select()
          .from(fixture.schema.webhookEvents)
          .where(eq(fixture.schema.webhookEvents.id, eventId));
        expect(stored).toMatchObject({
          status: 'dead',
          leaseOwner: null,
          lastErrorCode: command.code,
          lastErrorMessage: command.message,
        });
      },
    },

    {
      name: 'rejects stale and replayed terminal fences without mutation',
      proves: ['expected-rejection-no-partial-write'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.deadLetterEvent;
        expect(await cell.execute({ ...command, attempt: 2 })).toEqual({
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
      name: 'fences a divergent terminal race',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.deadLetterEvent;
        const results = await Promise.all([
          cell.execute(command),
          cell.execute({ ...command, code: 'another_terminal_failure' }),
        ]);
        expect(
          results.map((result) => result.kind === 'success' && result.value),
        ).toEqual(expect.arrayContaining(['applied', 'lease_lost']));
      },
    },

    {
      name: 'rolls back an unavailable dead-letter transition',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedClaim();
        const cell = fixture.makeSystem().cells.deadLetterEvent;
        await expect(
          fixture.withUnavailableTable('webhook_events', () =>
            cell.execute(command),
          ),
        ).rejects.toMatchObject({
          kind: 'DatabaseError',
          code: 'webhook_event_dead_letter_failed',
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
