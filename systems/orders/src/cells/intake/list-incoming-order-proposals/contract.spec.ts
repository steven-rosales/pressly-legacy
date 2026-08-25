import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { listIncomingOrderProposalsCellDeclaration } from './cell.ts';
import { listIncomingOrderProposalsContract } from './contract.ts';

proveOperation({
  operationId: 'orders.list-incoming-order-proposals.v1',
  declaration: listIncomingOrderProposalsCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict proposal query and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const query = {
          locationId: 'east',
          limit: 25,
          cursor: null,
          view: 'needs_review' as const,
        };
        const encoded = listIncomingOrderProposalsContract.input.encode(query);
        expect(
          listIncomingOrderProposalsContract.input.decode(encoded),
        ).toMatchObject({ kind: 'valid' });
        expect(
          listIncomingOrderProposalsContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
