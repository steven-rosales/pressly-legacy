import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { rejectIncomingOrderProposalCellDeclaration } from './cell.ts';
import { rejectIncomingOrderProposalContract } from './contract.ts';

proveOperation({
  operationId: 'orders.reject-incoming-order-proposal.v1',
  declaration: rejectIncomingOrderProposalCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict optimistic rejection and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          proposalId: 'proposal-1',
          locationId: 'east',
          expectedVersion: 1,
          idempotencyKey: 'reject-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'duplicate_order' as const,
          reasonNote: null,
        };
        const encoded =
          rejectIncomingOrderProposalContract.input.encode(command);
        expect(
          rejectIncomingOrderProposalContract.input.decode(encoded),
        ).toMatchObject({ kind: 'valid' });
        expect(
          rejectIncomingOrderProposalContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
