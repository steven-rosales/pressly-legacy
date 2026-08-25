import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { retryOrderOutboxCellDeclaration } from './cell.ts';
import { makeExecuteRetryOrderOutbox } from './execute.ts';

proveOperation({
  operationId: 'orders.retry-order-outbox.v1',
  declaration: retryOrderOutboxCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'passes the exact retry time and error evidence to persistence',
      proves: ['executor-success'],
      run: async () => {
        const command = {
          eventId: 'event-1',
          workerId: 'worker-1',
          availableAt: new Date('2026-08-23T16:02:00.000Z'),
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        };
        const retry = vi.fn(async () => true);
        await expect(
          makeExecuteRetryOrderOutbox({ retry })(command),
        ).resolves.toEqual({ kind: 'success', value: { retried: true } });
        expect(retry).toHaveBeenCalledWith(command);
      },
    },
  ],
});
