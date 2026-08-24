import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { measureOrderOutboxBacklogCellDeclaration } from './cell.ts';
import { makeExecuteMeasureOrderOutboxBacklog } from './execute.ts';

proveOperation({
  operationId: 'orders.measure-order-outbox-backlog.v1',
  declaration: measureOrderOutboxBacklogCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'measures stored backlog once and projects its age from the injected clock',
      proves: ['executor-success'],
      run: async () => {
        const now = new Date('2026-08-23T16:00:00.000Z');
        const measure = vi.fn(async () => ({
          pendingCount: 3,
          oldestPendingAt: new Date(now.getTime() - 42_000),
        }));
        await expect(
          makeExecuteMeasureOrderOutboxBacklog({
            repo: { measure },
            clock: { now: () => now },
          })({}),
        ).resolves.toEqual({
          kind: 'success',
          value: { pendingCount: 3, oldestPendingAgeSeconds: 42 },
        });
        expect(measure).toHaveBeenCalledOnce();
      },
    },
  ],
});
