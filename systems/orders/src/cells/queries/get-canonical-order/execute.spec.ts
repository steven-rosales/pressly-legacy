import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  ordersUnitProofCanonicalOrderDetail,
  ordersUnitProofOrderId,
} from '../../../testing/operation.spec-support.ts';
import { getCanonicalOrderCellDeclaration } from './cell.ts';
import { validateGetCanonicalOrder } from './decide.ts';
import { makeExecuteGetCanonicalOrder } from './execute.ts';

const query = {
  businessId: 'business-1',
  locationIds: ['east'],
  orderId: ordersUnitProofOrderId,
};

proveOperation({
  operationId: 'orders.get-canonical-order.v1',
  declaration: getCanonicalOrderCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'accepts a fully scoped detail query and rejects an empty Order identity purely',
      proves: ['decision'],
      run: () => {
        expect(validateGetCanonicalOrder(query)).toBeNull();
        expect(
          validateGetCanonicalOrder({ ...query, orderId: ' ' }),
        ).toMatchObject({ code: 'order_get_invalid' });
      },
    },
    {
      name: 'loads the exact scoped Order detail through its injected repository',
      proves: ['executor-success'],
      run: async () => {
        const get = vi.fn(async () => ordersUnitProofCanonicalOrderDetail);
        await expect(
          makeExecuteGetCanonicalOrder({ get })(query),
        ).resolves.toEqual({
          kind: 'success',
          value: ordersUnitProofCanonicalOrderDetail,
        });
        expect(get).toHaveBeenCalledWith(query);
      },
    },
    {
      name: 'returns the exact order_not_found failure for an absent scoped Order',
      proves: ['executor-success'],
      run: async () => {
        await expect(
          makeExecuteGetCanonicalOrder({ get: async () => null })(query),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'not_found',
            code: 'order_not_found',
            message: 'The Order was not found.',
          },
        });
      },
    },
  ],
});
