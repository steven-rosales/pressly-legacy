import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, vi } from 'vitest';
import { deadLetterEventCellDeclaration } from './cell.ts';
import { makeExecuteDeadLetterEvent } from './execute.ts';

describe('dead-letter-event execution', () => {
  proveOperation({
    operationId: 'ingress.dead-letter-event.v1',
    declaration: deadLetterEventCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'preserves the exact fenced claim and terminal diagnostic',
        proves: ['executor-success'],
        run: async () => {
          const deadLetter = vi.fn(async () => 'applied' as const);
          const execute = makeExecuteDeadLetterEvent({ deadLetter });
          const command = {
            eventId: '81000000-0000-4000-8000-000000000001',
            workerId: 'worker-1',
            attempt: 8,
            code: 'projection_failed',
            message: 'attempt budget exhausted',
          };

          await expect(execute(command)).resolves.toEqual({
            kind: 'success',
            value: 'applied',
          });
          expect(deadLetter).toHaveBeenCalledWith(command);
        },
      },
    ],
  });
});
