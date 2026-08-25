import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { retryEventCellDeclaration } from './cell.ts';
import { makeExecuteRetryEvent } from './execute.ts';

describe('retry-event execution', () => {
  proveOperation({
    operationId: 'ingress.retry-event.v1',
    declaration: retryEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves the exact retry schedule and diagnostic metadata',
        proves: ['executor-success'],
        run: async () => {
          const retry = vi.fn(async () => 'applied' as const);
          const execute = makeExecuteRetryEvent({ retry });
          const command = {
            eventId: '81000000-0000-4000-8000-000000000001',
            workerId: 'worker-1',
            attempt: 2,
            availableAt: new Date('2026-08-22T16:05:00.000Z'),
            code: 'projection_failed',
            message: 'retry later',
          };

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: 'applied',
          });
          expect(retry).toHaveBeenCalledWith(command);
        },
      },
    ],
  });
});
