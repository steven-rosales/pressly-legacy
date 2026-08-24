import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { retryOrderOutboxCellDeclaration } from './cell.ts';
import { retryOrderOutboxContract } from './contract.ts';

proveOperation({
  operationId: 'orders.retry-order-outbox.v1',
  declaration: retryOrderOutboxCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips retry scheduling with an exact UTC availability time',
      proves: ['contract'],
      run: () => {
        const command = {
          eventId: 'event-1',
          workerId: 'worker-1',
          availableAt: new Date('2026-08-22T16:02:00.000Z'),
          errorCode: 'temporary_failure',
          errorMessage: 'Temporary downstream failure.',
        };
        const encoded = retryOrderOutboxContract.input.encode(command);
        expect(encoded).toMatchObject({
          availableAt: '2026-08-22T16:02:00.000Z',
        });
        expect(retryOrderOutboxContract.input.decode(encoded)).toEqual({
          kind: 'valid',
          value: command,
        });
      },
    },
  ],
});
