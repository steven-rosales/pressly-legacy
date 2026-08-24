import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  makeMeasureOrderOutboxBacklogCell,
  measureOrderOutboxBacklogCellDeclaration,
} from './cell.ts';
import { makeMeasureOrderOutboxBacklogPostgresRepository } from './postgres.ts';
import {
  insertOrdersPostgresProofEvent,
  ordersPostgresProofClock,
  ordersPostgresProofDatabase,
  ordersPostgresProofNow,
  seedOrdersPostgresCanonicalOrder,
  useOrdersPostgresProof,
} from '../../../testing/postgres.spec-support.ts';
import { ordersTestSchema } from '../../../testing/schema.ts';

useOrdersPostgresProof('measure-order-outbox-backlog');

proveOperation({
  operationId: 'orders.measure-order-outbox-backlog.v1',
  declaration: measureOrderOutboxBacklogCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'measures only unfinished rows from creation age and uses zero for an empty backlog',
      proves: ['executor-success'],
      run: async () => {
        await seedOrdersPostgresCanonicalOrder({ releaseState: 'released' });
        const cell = makeMeasureOrderOutboxBacklogCell({
          repo: makeMeasureOrderOutboxBacklogPostgresRepository(
            ordersPostgresProofDatabase.db,
            ordersTestSchema,
          ),
          clock: ordersPostgresProofClock,
        });
        await expect(cell.execute({})).resolves.toEqual({
          kind: 'success',
          value: { pendingCount: 0, oldestPendingAgeSeconds: 0 },
        });
        await insertOrdersPostgresProofEvent({
          index: 10,
          version: 1,
          createdAt: new Date('2026-08-22T15:55:00.000Z'),
        });
        await insertOrdersPostgresProofEvent({
          index: 11,
          version: 2,
          status: 'processing',
          leaseOwner: 'worker-active',
          leaseExpiresAt: new Date(ordersPostgresProofNow.getTime() + 300_000),
          createdAt: new Date('2026-08-22T15:50:00.000Z'),
        });
        await insertOrdersPostgresProofEvent({
          index: 12,
          version: 3,
          status: 'completed',
          completedAt: ordersPostgresProofNow,
          createdAt: new Date('2026-08-22T14:00:00.000Z'),
        });
        await expect(cell.execute({})).resolves.toEqual({
          kind: 'success',
          value: { pendingCount: 2, oldestPendingAgeSeconds: 600 },
        });
      },
    },
  ],
});
