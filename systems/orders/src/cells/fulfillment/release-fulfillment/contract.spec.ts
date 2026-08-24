import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { releaseFulfillmentCellDeclaration } from './cell.ts';
import { releaseFulfillmentContract } from './contract.ts';

proveOperation({
  operationId: 'orders.release-fulfillment.v1',
  declaration: releaseFulfillmentCellDeclaration,
  layer: 'contract',
  scenarios: [
    {
      name: 'round-trips one strict fulfillment release and rejects undeclared fields',
      proves: ['contract'],
      run: () => {
        const command = {
          businessId: 'business-1',
          fulfillmentId: 'fulfillment-1',
          locationId: 'east',
          expectedOrderVersion: 1,
          expectedFulfillmentVersion: 1,
          idempotencyKey: 'release-1',
          context: {
            origin: 'pressly_dashboard',
            principal: { kind: 'human' as const, id: 'identity-1' },
          },
          reasonCode: 'ready_for_production' as const,
          reasonNote: null,
        };
        const encoded = releaseFulfillmentContract.input.encode(command);
        expect(releaseFulfillmentContract.input.decode(encoded)).toMatchObject({
          kind: 'valid',
        });
        expect(
          releaseFulfillmentContract.input.decode({
            ...(encoded as Record<string, unknown>),
            undeclared: true,
          }),
        ).toMatchObject({ kind: 'invalid' });
      },
    },
  ],
});
