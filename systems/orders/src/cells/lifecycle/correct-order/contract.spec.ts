import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { correctOrderCellDeclaration } from './cell.ts';
import { correctOrderContract } from './contract.ts';

proveOperation({
  operationId: 'orders.correct-order.v1',
  declaration: correctOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict optimistic correction and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          locationId: 'east',
          orderId: 'order-1',
          expectedOrderVersion: 1,
          expectedFulfillmentVersion: 1,
          changes: { displayNumber: 'P-101' },
          idempotencyKey: 'correct-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'customer_correction' as const,
          reasonNote: null,
        };
        const encoded = correctOrderContract.input.encode(command);
        expect(correctOrderContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          correctOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
