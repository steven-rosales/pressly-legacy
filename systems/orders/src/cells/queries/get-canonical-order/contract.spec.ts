import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { getCanonicalOrderCellDeclaration } from './cell.ts';
import { getCanonicalOrderContract } from './contract.ts';

proveOperation({
  operationId: 'orders.get-canonical-order.v1',
  declaration: getCanonicalOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one business-scoped detail query and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const query = {
          businessId: 'business-1',
          locationIds: ['east'],
          orderId: 'order-1',
        };
        const encoded = getCanonicalOrderContract.input.encode(query);
        expect(getCanonicalOrderContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          getCanonicalOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
