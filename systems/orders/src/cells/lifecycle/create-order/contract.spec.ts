import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { createOrderCellDeclaration } from './cell.ts';
import { createOrderContract } from './contract.ts';

proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict direct Order command and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          idempotencyKey: 'create-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'new_customer_order' as const,
          reasonNote: null,
          customer: {
            resolution: 'not_provided' as const,
            userId: null,
            externalUserId: null,
          },
          displayNumber: 'P-100',
          dueAt: new Date('2026-08-23T20:00:00.000Z'),
          currency: 'USD',
          totalAmountCents: 3_600,
          balanceDueCents: 3_600,
          items: [],
          fulfillment: {
            typeCode: 'wash_fold',
            locationId: 'east',
            estimatedWeightLbs: 18,
            estimatedWeightSource: 'source_estimate',
          },
        };
        const encoded = createOrderContract.input.encode(command);
        expect(createOrderContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          createOrderContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
