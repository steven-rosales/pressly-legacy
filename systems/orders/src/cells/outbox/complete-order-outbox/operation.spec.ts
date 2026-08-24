import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { completeOrderOutboxCellDeclaration } from './cell.ts';
import { makeExecuteCompleteOrderOutbox } from './execute.ts';

proveOperation({
  operationId: 'orders.complete-order-outbox.v1',
  declaration: completeOrderOutboxCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'passes the exact lease owner and completion time to persistence',
      proves: ['executor-success'],
      run: async () => {
        const command = { eventId: 'event-1', workerId: 'worker-1' };
        const now = new Date('2026-08-23T16:00:00.000Z');
        const complete = vi.fn(async () => true);
        await expect(
          makeExecuteCompleteOrderOutbox({
            repo: { complete },
            clock: { now: () => now },
          })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: { completed: true },
        });
        expect(complete).toHaveBeenCalledWith({ command, now });
      },
    },
  ],
});
