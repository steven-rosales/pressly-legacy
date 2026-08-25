import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofMutationResult,
  ordersUnitProofOrderId,
} from '../../../testing/operation.spec-support.ts';
import { correctOrderCellDeclaration } from './cell.ts';
import { makeExecuteCorrectOrder } from './execute.ts';
import { correctOrderHttpSurfaces } from './http.ts';
import type { CorrectOrderCommand } from './types.ts';

const command: CorrectOrderCommand = {
  businessId: 'business-1',
  locationId: 'east',
  orderId: ordersUnitProofOrderId,
  expectedOrderVersion: 1,
  expectedFulfillmentVersion: 1,
  idempotencyKey: 'correct-order-1',
  context: ordersUnitProofContext,
  reasonCode: 'manager_correction',
  reasonNote: 'Correct the display number.',
  changes: { displayNumber: 'P-791' },
};

proveOperation({
  operationId: 'orders.correct-order.v1',
  declaration: correctOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'forwards the exact correction to its injected writer and preserves the result',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteCorrectOrder({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact correction HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = correctOrderHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'PATCH',
          path: '/order-management/locations/:locationId/orders/:orderId',
        });
        expect(
          surface?.present({
            kind: 'success',
            value: ordersUnitProofMutationResult,
          }),
        ).toMatchObject({ status: 200, body: { ok: true } });
      },
    },
  ],
});
