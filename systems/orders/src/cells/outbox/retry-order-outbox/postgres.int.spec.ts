import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makeRetryOrderOutboxCell,
  retryOrderOutboxCellDeclaration,
} from './cell.ts';
import { makeRetryOrderOutboxPostgresRepository } from './postgres.ts';
import {
  installOrdersPostgresUpdateFault,
  insertOrdersPostgresProofEvent,
  ordersPostgresProofDatabase,
  readOrdersPostgresProofEvents,
  removeOrdersPostgresUpdateFault,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('retry-order-outbox');

const retryCell = () =>
  makeRetryOrderOutboxCell(
    makeRetryOrderOutboxPostgresRepository(
      ordersPostgresProofDatabase.db,
      ordersTestSchema,
    ),
  );

proveOperation({
  operationId: 'orders.retry-order-outbox.v1',
  declaration: retryOrderOutboxCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'returns only the current owner to pending at the requested retry time',
      proves: ['postgres-commit', 'expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 80,
          version: 1,
          status: 'processing',
          attempts: 3,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const availableAt = new Date('2026-08-22T16:02:00.000Z');
        const cell = retryCell();
        await expect(
          cell.execute({
            eventId: id,
            workerId: 'worker-stale',
            availableAt,
            errorCode: 'temporary_failure',
            errorMessage: 'Temporary downstream failure.',
          }),
        ).resolves.toEqual({ kind: 'success', value: { retried: false } });
        await expect(
          cell.execute({
            eventId: id,
            workerId: 'worker-1',
            availableAt,
            errorCode: 'temporary_failure',
            errorMessage: 'Temporary downstream failure.',
          }),
        ).resolves.toEqual({ kind: 'success', value: { retried: true } });
        await expect(readOrdersPostgresProofEvents()).resolves.toMatchObject([
          {
            id,
            status: 'pending',
            attempts: 3,
            availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: 'temporary_failure',
            lastErrorMessage: 'Temporary downstream failure.',
          },
        ]);
      },
    },
    {
      name: 'rolls back retry scheduling when PostgreSQL rejects the state update',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 81,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const before = await readOrdersPostgresProofEvents();
        await installOrdersPostgresUpdateFault();
        try {
          await expect(
            retryCell().execute({
              eventId: id,
              workerId: 'worker-1',
              availableAt: new Date('2026-08-22T16:02:00.000Z'),
              errorCode: 'temporary_failure',
              errorMessage: 'Temporary downstream failure.',
            }),
          ).rejects.toMatchObject({ code: 'order_outbox_retry_failed' });
        } finally {
          await removeOrdersPostgresUpdateFault();
        }
        expect(await readOrdersPostgresProofEvents()).toEqual(before);
      },
    },
    {
      name: 'serializes concurrent retry attempts through the lease-owner fence',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 82,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const input = {
          eventId: id,
          workerId: 'worker-1',
          availableAt: new Date('2026-08-22T16:02:00.000Z'),
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        };
        const outcomes = await Promise.all([
          retryCell().execute(input),
          retryCell().execute(input),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.retried : null,
          ),
        ).toEqual(expect.arrayContaining([true, false]));
        expect(
          outcomes.filter(
            (outcome) => outcome.kind === 'success' && outcome.value.retried,
          ),
        ).toHaveLength(1);
      },
    },
  ],
});
