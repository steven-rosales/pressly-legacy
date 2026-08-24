import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { claimOrderOutboxCellDeclaration } from './cell.ts';
import { claimOrderOutboxContract } from './contract.ts';

proveOperation({
  operationId: 'orders.claim-order-outbox.v1',
  declaration: claimOrderOutboxCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips the bounded lease request and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        expect(claimOrderOutboxContract.input.version).toBe(1);
        expect(claimOrderOutboxContract.output.version).toBe(2);
        expect(claimOrderOutboxContract.failure.version).toBe(1);
        const command = { workerId: 'worker-1', limit: 10, leaseMs: 30_000 };
        const encoded = claimOrderOutboxContract.input.encode(command);
        expect(claimOrderOutboxContract.input.decode(encoded)).toEqual({
          kind: 'valid',
          value: command,
        });
        expect(
          claimOrderOutboxContract.input.decode({ ...command, extra: true }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
