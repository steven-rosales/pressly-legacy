import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { acceptIncomingOrderProposalCellDeclaration } from './cell.ts';
import { acceptIncomingOrderProposalContract } from './contract.ts';

proveOperation({
  operationId: 'orders.accept-incoming-order-proposal.v1',
  declaration: acceptIncomingOrderProposalCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict optimistic acceptance and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          proposalId: 'proposal-1',
          locationId: 'east',
          expectedVersion: 1,
          idempotencyKey: 'accept-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'incoming_order_accepted' as const,
          reasonNote: null,
        };
        const encoded =
          acceptIncomingOrderProposalContract.input.encode(command);
        expect(
          acceptIncomingOrderProposalContract.input.decode(encoded),
        ).toMatchObject({ kind: 'valid' });
        expect(
          acceptIncomingOrderProposalContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
