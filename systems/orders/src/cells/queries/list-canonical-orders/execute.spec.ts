import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listCanonicalOrdersCellDeclaration } from './cell.ts';
import {
  normalizeListCanonicalOrders,
  validateListCanonicalOrders,
} from './decide.ts';
import { makeExecuteListCanonicalOrders } from './execute.ts';

const query = {
  businessId: 'business-1',
  locationIds: ['east'],
  query: '  P-790  ',
  state: 'open' as const,
  limit: 25,
  cursor: null,
};
const result = { items: [], nextCursor: null };

proveOperation({
  operationId: 'orders.list-canonical-orders.v1',
  declaration: listCanonicalOrdersCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'validates page bounds and normalizes the search term purely',
      proves: ['decision'],
      run: () => {
        expect(validateListCanonicalOrders(query)).toBeNull();
        expect(normalizeListCanonicalOrders(query)).toMatchObject({
          query: 'P-790',
        });
        expect(
          validateListCanonicalOrders({ ...query, limit: 101 }),
        ).toMatchObject({ code: 'order_list_invalid' });
      },
    },
    {
      name: 'executes the normalized scoped list query with an explicit null cursor',
      proves: ['executor-success'],
      run: async () => {
        const list = vi.fn(async () => result);
        await expect(
          makeExecuteListCanonicalOrders({ list })(query),
        ).resolves.toEqual({ kind: 'success', value: result });
        expect(list).toHaveBeenCalledWith({
          query: { ...query, query: 'P-790' },
          cursor: null,
        });
      },
    },
    {
      name: 'returns order_cursor_invalid before executing the repository',
      proves: ['decision'],
      run: async () => {
        const list = vi.fn(async () => result);
        await expect(
          makeExecuteListCanonicalOrders({ list })({
            ...query,
            cursor: 'not-a-canonical-order-cursor',
          }),
        ).resolves.toMatchObject({
          kind: 'failure',
          failure: { kind: 'validation', code: 'order_cursor_invalid' },
        });
        expect(list).not.toHaveBeenCalled();
      },
    },
  ],
});
