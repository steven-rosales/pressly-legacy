import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  deadLetterOrderOutboxCellDeclaration,
  makeDeadLetterOrderOutboxCell,
} from './cell.ts';
import { makeDeadLetterOrderOutboxPostgresRepository } from './postgres.ts';
import {
  installOrdersPostgresUpdateFault,
  insertOrdersPostgresProofEvent,
  ordersPostgresProofClock,
  ordersPostgresProofDatabase,
  ordersPostgresProofNow,
  readOrdersPostgresProofEvents,
  removeOrdersPostgresUpdateFault,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('dead-letter-order-outbox');

const deadLetterCell = () =>
  makeDeadLetterOrderOutboxCell({
    repo: makeDeadLetterOrderOutboxPostgresRepository(
      ordersPostgresProofDatabase.db,
      ordersTestSchema,
    ),
    clock: ordersPostgresProofClock,
  });

proveOperation({
  operationId: 'orders.dead-letter-order-outbox.v1',
  declaration: deadLetterOrderOutboxCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'dead-letters only the current owner and retains terminal error evidence',
      proves: ['postgres-commit', 'expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 90,
          version: 1,
          status: 'processing',
          attempts: 8,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const cell = deadLetterCell();
        await expect(
          cell.execute({
            eventId: id,
            workerId: 'worker-stale',
            errorCode: 'invalid_event',
            errorMessage: 'Invalid durable event.',
          }),
        ).resolves.toEqual({
          kind: 'success',
          value: { deadLettered: false },
        });
        await expect(
          cell.execute({
            eventId: id,
            workerId: 'worker-1',
            errorCode: 'invalid_event',
            errorMessage: 'Invalid durable event.',
          }),
        ).resolves.toEqual({
          kind: 'success',
          value: { deadLettered: true },
        });
        await expect(readOrdersPostgresProofEvents()).resolves.toMatchObject([
          {
            id,
            status: 'dead',
            attempts: 8,
            leaseOwner: null,
            leaseExpiresAt: null,
            deadAt: ordersPostgresProofNow,
            lastErrorCode: 'invalid_event',
            lastErrorMessage: 'Invalid durable event.',
          },
        ]);
      },
    },
    {
      name: 'rolls back dead-lettering when PostgreSQL rejects the state update',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 91,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const before = await readOrdersPostgresProofEvents();
        await installOrdersPostgresUpdateFault();
        try {
          await expect(
            deadLetterCell().execute({
              eventId: id,
              workerId: 'worker-1',
              errorCode: 'invalid_event',
              errorMessage: 'Invalid durable event.',
            }),
          ).rejects.toMatchObject({ code: 'order_outbox_dead_letter_failed' });
        } finally {
          await removeOrdersPostgresUpdateFault();
        }
        expect(await readOrdersPostgresProofEvents()).toEqual(before);
      },
    },
    {
      name: 'serializes concurrent dead-letter attempts through the lease-owner fence',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 92,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const input = {
          eventId: id,
          workerId: 'worker-1',
          errorCode: 'invalid_event',
          errorMessage: 'Invalid durable event.',
        };
        const outcomes = await Promise.all([
          deadLetterCell().execute(input),
          deadLetterCell().execute(input),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.deadLettered : null,
          ),
        ).toEqual(expect.arrayContaining([true, false]));
        expect(
          outcomes.filter(
            (outcome) =>
              outcome.kind === 'success' && outcome.value.deadLettered,
          ),
        ).toHaveLength(1);
      },
    },
  ],
});
