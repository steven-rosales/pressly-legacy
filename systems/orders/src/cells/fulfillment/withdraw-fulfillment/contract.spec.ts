import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { withdrawFulfillmentCellDeclaration } from './cell.ts';
import { withdrawFulfillmentContract } from './contract.ts';

proveOperation({
  operationId: 'orders.withdraw-fulfillment.v1',
  declaration: withdrawFulfillmentCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict fulfillment withdrawal and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          fulfillmentId: 'fulfillment-1',
          locationId: 'east',
          expectedOrderVersion: 1,
          expectedFulfillmentVersion: 1,
          idempotencyKey: 'withdraw-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'commercial_canceled' as const,
          reasonNote: null,
        };
        const encoded = withdrawFulfillmentContract.input.encode(command);
        expect(withdrawFulfillmentContract.input.decode(encoded)).toMatchObject(
          {
            kind: 'valid',
          },
        );
        expect(
          withdrawFulfillmentContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
