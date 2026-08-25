import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofContext,
  ordersUnitProofMutationResult,
} from '../../../testing/operation.spec-support.ts';
import { createOrderCellDeclaration } from './cell.ts';
import { makeExecuteCreateOrder } from './execute.ts';
import { createOrderHttpSurfaces } from './http.ts';
import type { CreateOrderCommand } from './types.ts';

const command: CreateOrderCommand = {
  businessId: 'business-1',
  idempotencyKey: 'create-order-1',
  context: ordersUnitProofContext,
  reasonCode: 'new_customer_order',
  reasonNote: null,
  customer: {
    resolution: 'not_provided',
    userId: null,
    externalUserId: null,
  },
  displayNumber: 'P-790',
  dueAt: new Date('2026-08-25T20:00:00.000Z'),
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

proveOperation({
  operationId: 'orders.create-order.v1',
  declaration: createOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'forwards the exact direct Order command to its injected writer',
      proves: ['executor-success'],
      run: async () => {
        const writer = vi.fn(async () => ({
          kind: 'success' as const,
          value: ordersUnitProofMutationResult,
        }));
        await expect(
          makeExecuteCreateOrder({ writer })(command),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofMutationResult,
        });
        expect(writer).toHaveBeenCalledWith(command);
      },
    },
    {
      name: 'declares and presents the exact create-Order HTTP protocol',
      proves: ['protocol'],
      run: () => {
        const surface = createOrderHttpSurfaces[0];
        expect(surface).toMatchObject({
          kind: 'http',
          method: 'POST',
          path: '/order-management/locations/:locationId/orders',
        });
        expect(
          surface?.present({
            kind: 'success',
            value: ordersUnitProofMutationResult,
          }),
        ).toMatchObject({ status: 201, body: { ok: true } });
      },
    },
  ],
});
