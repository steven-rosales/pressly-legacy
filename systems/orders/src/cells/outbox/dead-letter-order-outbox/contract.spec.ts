import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { deadLetterOrderOutboxCellDeclaration } from './cell.ts';
import { deadLetterOrderOutboxContract } from './contract.ts';

proveOperation({
  operationId: 'orders.dead-letter-order-outbox.v1',
  declaration: deadLetterOrderOutboxCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips terminal delivery evidence and its validation failure',
      proves: ['contract'],
      run: () => {
        const command = {
          eventId: 'event-1',
          workerId: 'worker-1',
          errorCode: 'invalid_event',
          errorMessage: 'Invalid durable event.',
        };
        expect(
          deadLetterOrderOutboxContract.input.decode(
            deadLetterOrderOutboxContract.input.encode(command),
          ),
        ).toEqual({ kind: 'valid', value: command });
        const failure = {
          kind: 'validation' as const,
          code: 'order_outbox_dead_letter_invalid' as const,
          message: 'Invalid dead-letter command.',
        };
        expect(
          deadLetterOrderOutboxContract.failure.decode(
            deadLetterOrderOutboxContract.failure.encode(failure),
          ),
        ).toEqual({ kind: 'valid', value: failure });
      },
    },
  ],
});
