import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { completeOrderOutboxCellDeclaration } from './cell.ts';
import { completeOrderOutboxContract } from './contract.ts';

proveOperation({
  operationId: 'orders.complete-order-outbox.v1',
  declaration: completeOrderOutboxCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips the lease-owner completion fence and boolean result',
      proves: ['contract'],
      run: () => {
        const command = { eventId: 'event-1', workerId: 'worker-1' };
        expect(
          completeOrderOutboxContract.input.decode(
            completeOrderOutboxContract.input.encode(command),
          ),
        ).toEqual({ kind: 'valid', value: command });
        expect(
          completeOrderOutboxContract.output.decode(
            completeOrderOutboxContract.output.encode({ completed: true }),
          ),
        ).toEqual({ kind: 'valid', value: { completed: true } });
      },
    },
  ],
});
