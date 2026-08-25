import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { measureOrderOutboxBacklogCellDeclaration } from './cell.ts';
import { measureOrderOutboxBacklogContract } from './contract.ts';

proveOperation({
  operationId: 'orders.measure-order-outbox-backlog.v1',
  declaration: measureOrderOutboxBacklogCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips the empty query and nonnegative backlog measurement',
      proves: ['contract'],
      run: () => {
        expect(measureOrderOutboxBacklogContract.input.decode({})).toEqual({
          kind: 'valid',
          value: {},
        });
        const value = { pendingCount: 3, oldestPendingAgeSeconds: 42 };
        expect(
          measureOrderOutboxBacklogContract.output.decode(
            measureOrderOutboxBacklogContract.output.encode(value),
          ),
        ).toEqual({ kind: 'valid', value });
      },
    },
  ],
});
