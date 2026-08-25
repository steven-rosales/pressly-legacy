import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { claimEventsCellDeclaration } from './cell.ts';
import { makeExecuteClaimEvents } from './execute.ts';

describe('claim-events execution', () => {
  proveOperation({
    operationId: 'ingress.claim-events.v1',
    declaration: claimEventsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'supplies one clock reading to the atomic claim repository',
        proves: ['executor-success'],
        run: async () => {
          const now = new Date('2026-08-22T16:00:00.000Z');
          const claim = vi.fn(async () => []);
          const execute = makeExecuteClaimEvents({
            repo: { claim },
            clock: { now: () => now },
          });
          const command = { workerId: 'worker-1', leaseMs: 30_000, limit: 10 };

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: [],
          });
          expect(claim).toHaveBeenCalledWith({ command, now });
        },
      },
    ],
  });
});
