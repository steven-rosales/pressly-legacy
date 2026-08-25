import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofMutationResult,
  ordersUnitProofOrderId,
} from '../../../testing/operation.spec-support.ts';
import { completeOrderCellDeclaration } from './cell.ts';
import { validateCompleteOrder } from './decide.ts';
import { makeExecuteCompleteOrder } from './execute.ts';
import { completeOrderHttpSurfaces } from './http.ts';
import type { CompleteOrderCommand } from './types.ts';

const command: CompleteOrderCommand = {
  businessId: 'business-1',
  locationId: 'east',
  orderId: ordersUnitProofOrderId,
  expectedVersion: 1,
  idempotencyKey: 'complete-order-1',
  context: ordersUnitProofContext,
  reasonCode: 'service_completed',
  reasonNote: null,
};

proveOperation({
  operationId: 'orders.complete-order.v1',
  declaration: completeOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts complete evidence and rejects an invalid expected version purely',
      proves: ['decision'],
      run: () => {
        expect(validateCompleteOrder(command)).toBeNull();
        expect(
          validateCompleteOrder({ ...command, expectedVersion: 0 }),
        ).toMatchObject({ code: 'order_lifecycle_command_invalid' });
      },
    },
    {
      name: 'executes completion only after validation and preserves the writer result',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteCompleteOrder({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact completion HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = completeOrderHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/orders/:orderId/complete',
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
