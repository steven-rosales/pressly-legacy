import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  completeOrderOutboxCellDeclaration,
  makeCompleteOrderOutboxCell,
} from './cell.ts';
import { makeCompleteOrderOutboxPostgresRepository } from './postgres.ts';
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

useOrdersPostgresProof('complete-order-outbox');

const completeCell = () =>
  makeCompleteOrderOutboxCell({
    repo: makeCompleteOrderOutboxPostgresRepository(
      ordersPostgresProofDatabase.db,
      ordersTestSchema,
    ),
    clock: ordersPostgresProofClock,
  });

proveOperation({
  operationId: 'orders.complete-order-outbox.v1',
  declaration: completeOrderOutboxCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'completes only the current lease owner and clears prior errors',
      proves: ['postgres-commit', 'expected-rejection-no-partial-write'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 70,
          version: 1,
          status: 'processing',
          attempts: 9,
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
          lastErrorCode: 'old_error',
          lastErrorMessage: 'Old error.',
        });
        const cell = completeCell();
        await expect(
          cell.execute({ eventId: id, workerId: 'worker-stale' }),
        ).resolves.toEqual({ kind: 'success', value: { completed: false } });
        await expect(
          cell.execute({ eventId: id, workerId: 'worker-1' }),
        ).resolves.toEqual({ kind: 'success', value: { completed: true } });
        await expect(readOrdersPostgresProofEvents()).resolves.toMatchObject([
          {
            id,
            status: 'completed',
            attempts: 9,
            leaseOwner: null,
            leaseExpiresAt: null,
            completedAt: ordersPostgresProofNow,
            lastErrorCode: null,
            lastErrorMessage: null,
          },
        ]);
      },
    },
    {
      name: 'keeps terminal completion replay-safe for the same worker identity',
      proves: ['same-payload-replay'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 71,
          version: 1,
          status: 'completed',
          completedAt: ordersPostgresProofNow,
        });
        await expect(
          completeCell().execute({ eventId: id, workerId: 'worker-1' }),
        ).resolves.toEqual({ kind: 'success', value: { completed: false } });
      },
    },
    {
      name: 'rolls back completion when PostgreSQL rejects the state update',
      proves: ['unexpected-failure-rollback'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 72,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const before = await readOrdersPostgresProofEvents();
        await installOrdersPostgresUpdateFault();
        try {
          await expect(
            completeCell().execute({ eventId: id, workerId: 'worker-1' }),
          ).rejects.toMatchObject({ code: 'order_outbox_completion_failed' });
        } finally {
          await removeOrdersPostgresUpdateFault();
        }
        expect(await readOrdersPostgresProofEvents()).toEqual(before);
      },
    },
    {
      name: 'serializes concurrent completion attempts through the lease-owner fence',
      proves: ['declared-concurrency-race'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const id = await insertOrdersPostgresProofEvent({
          index: 73,
          version: 1,
          status: 'processing',
          leaseOwner: 'worker-1',
          leaseExpiresAt: new Date('2026-08-22T16:05:00.000Z'),
        });
        const outcomes = await Promise.all([
          completeCell().execute({ eventId: id, workerId: 'worker-1' }),
          completeCell().execute({ eventId: id, workerId: 'worker-1' }),
        ]);
        expect(
          outcomes.map((outcome) =>
            outcome.kind === 'success' ? outcome.value.completed : null,
          ),
        ).toEqual(expect.arrayContaining([true, false]));
        expect(
          outcomes.filter(
            (outcome) => outcome.kind === 'success' && outcome.value.completed,
          ),
        ).toHaveLength(1);
      },
    },
  ],
});
