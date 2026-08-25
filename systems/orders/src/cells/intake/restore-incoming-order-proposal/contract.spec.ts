import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { restoreIncomingOrderProposalCellDeclaration } from './cell.ts';
import { restoreIncomingOrderProposalContract } from './contract.ts';

proveOperation({
  operationId: 'orders.restore-incoming-order-proposal.v1',
  declaration: restoreIncomingOrderProposalCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict optimistic restoration and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          proposalId: 'proposal-1',
          locationId: 'east',
          expectedVersion: 2,
          idempotencyKey: 'restore-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'source_closure_overridden' as const,
          reasonNote: null,
        };
        const encoded =
          restoreIncomingOrderProposalContract.input.encode(command);
        expect(
          restoreIncomingOrderProposalContract.input.decode(encoded),
        ).toMatchObject({ kind: 'valid' });
        expect(
          restoreIncomingOrderProposalContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
