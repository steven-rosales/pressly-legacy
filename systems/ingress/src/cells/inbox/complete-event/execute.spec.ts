import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { completeEventCellDeclaration } from './cell.ts';
import { makeExecuteCompleteEvent } from './execute.ts';

describe('complete-event execution', () => {
  proveOperation({
    operationId: 'ingress.complete-event.v1',
    declaration: completeEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'records the processing timestamp and preserves lease-lost as data',
        proves: ['executor-success'],
        run: async () => {
          const now = new Date('2026-08-22T16:00:00.000Z');
          const complete = vi.fn(async () => 'lease_lost' as const);
          const execute = makeExecuteCompleteEvent({
            repo: { complete },
            clock: { now: () => now },
          });
          const claim = {
            eventId: '81000000-0000-4000-8000-000000000001',
            workerId: 'worker-1',
            attempt: 2,
          };

          await expect(execute(claim)).resolves.toEqual({
            kind: 'success',
            value: 'lease_lost',
          });
          expect(complete).toHaveBeenCalledWith({ ...claim, processedAt: now });
        },
      },
    ],
  });
});
