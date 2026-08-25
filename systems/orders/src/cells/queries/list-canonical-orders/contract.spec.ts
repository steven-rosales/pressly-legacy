import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { listCanonicalOrdersCellDeclaration } from './cell.ts';
import { listCanonicalOrdersContract } from './contract.ts';

proveOperation({
  operationId: 'orders.list-canonical-orders.v1',
  declaration: listCanonicalOrdersCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one business-scoped page query and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const query = {
          businessId: 'business-1',
          locationIds: ['east'],
          query: null,
          state: null,
          limit: 25,
          cursor: null,
        };
        const encoded = listCanonicalOrdersContract.input.encode(query);
        expect(listCanonicalOrdersContract.input.decode(encoded)).toMatchObject(
          { kind: 'valid' },
        );
        expect(
          listCanonicalOrdersContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
