import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofMutationResult,
  ordersUnitProofOrderId,
} from '../../../testing/operation.spec-support.ts';
import { cancelOrderCellDeclaration } from './cell.ts';
import { validateCancelOrder } from './decide.ts';
import { makeExecuteCancelOrder } from './execute.ts';
import { cancelOrderHttpSurfaces } from './http.ts';
import type { CancelOrderCommand } from './types.ts';

const command: CancelOrderCommand = {
  businessId: 'business-1',
  locationId: 'east',
  orderId: ordersUnitProofOrderId,
  expectedVersion: 1,
  idempotencyKey: 'cancel-order-1',
  context: ordersUnitProofContext,
  reasonCode: 'customer_canceled',
  reasonNote: null,
};

proveOperation({
  operationId: 'orders.cancel-order.v1',
  declaration: cancelOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts cancellation evidence and rejects an invalid expected version purely',
      proves: ['decision'],
      run: () => {
        expect(validateCancelOrder(command)).toBeNull();
        expect(
          validateCancelOrder({ ...command, expectedVersion: 0 }),
        ).toMatchObject({ code: 'order_lifecycle_command_invalid' });
      },
    },
    {
      name: 'executes cancellation only after validation and preserves the writer result',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteCancelOrder({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact cancellation HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = cancelOrderHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/orders/:orderId/cancel',
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
