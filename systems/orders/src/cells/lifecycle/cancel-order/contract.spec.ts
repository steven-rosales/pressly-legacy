import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { cancelOrderCellDeclaration } from './cell.ts';
import { cancelOrderContract } from './contract.ts';

proveOperation({
  operationId: 'orders.cancel-order.v1',
  declaration: cancelOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict cancellation command and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          locationId: 'east',
          orderId: 'order-1',
          expectedVersion: 1,
          idempotencyKey: 'cancel-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'customer_canceled' as const,
          reasonNote: null,
        };
        const encoded = cancelOrderContract.input.encode(command);
        expect(cancelOrderContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          cancelOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
