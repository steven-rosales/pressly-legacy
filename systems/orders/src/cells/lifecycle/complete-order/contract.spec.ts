import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { completeOrderCellDeclaration } from './cell.ts';
import { completeOrderContract } from './contract.ts';

proveOperation({
  operationId: 'orders.complete-order.v1',
  declaration: completeOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict completion command and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          locationId: 'east',
          orderId: 'order-1',
          expectedVersion: 1,
          idempotencyKey: 'complete-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'service_completed' as const,
          reasonNote: null,
        };
        const encoded = completeOrderContract.input.encode(command);
        expect(completeOrderContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          completeOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
