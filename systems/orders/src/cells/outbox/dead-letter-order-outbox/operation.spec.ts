import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { deadLetterOrderOutboxCellDeclaration } from './cell.ts';
import { validateDeadLetterOrderOutbox } from './decide.ts';
import { makeExecuteDeadLetterOrderOutbox } from './execute.ts';

const command = {
  eventId: 'event-1',
  workerId: 'worker-1',
  errorCode: 'invalid_event',
  errorMessage: 'Invalid durable event.',
};
const now = new Date('2026-08-23T16:00:00.000Z');

proveOperation({
  operationId: 'orders.dead-letter-order-outbox.v1',
  declaration: deadLetterOrderOutboxCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts complete terminal evidence and rejects an empty error code purely',
      proves: ['decision'],
      run: () => {
        expect(validateDeadLetterOrderOutbox(command)).toBeNull();
        expect(
          validateDeadLetterOrderOutbox({ ...command, errorCode: ' ' }),
        ).toMatchObject({ code: 'order_outbox_dead_letter_invalid' });
      },
    },
    {
      name: 'passes exact terminal evidence and time to the lease-fenced writer',
      proves: ['executor-success'],
      run: async () => {
        const deadLetter = vi.fn(async () => true);
        await expect(
          makeExecuteDeadLetterOrderOutbox({
            repo: { deadLetter },
            clock: { now: () => now },
          })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: { deadLettered: true },
        });
        expect(deadLetter).toHaveBeenCalledWith({ command, now });
      },
    },
  ],
});
