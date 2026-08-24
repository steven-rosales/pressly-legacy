import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { listCustomersCellDeclaration } from './cell.ts';
import { listCustomersContract } from './contract.ts';
import { decodeCustomerCursor, encodeCustomerCursor } from './cursor.ts';
import {
  normalizeListCustomersQuery,
  validateListCustomers,
} from './decide.ts';
import { makeExecuteListCustomers } from './execute.ts';

const businessId = '00000000-0000-4000-8000-000000000100';
const query = {
  businessId,
  query: 'Ada',
  active: true,
  limit: 50,
  cursor: null,
} as const;

proveOperation({
  operationId: 'customers.list-customers.v1',
  declaration: listCustomersCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the strict list contract and bounded declaration',
      proves: ['contract'],
      run: () => {
        expect(listCustomersContract.input.decode(query)).toEqual({
          kind: 'valid',
          value: query,
        });
        expect(
          listCustomersContract.input.decode({ ...query, extra: true }).kind,
        ).toBe('invalid');
        expect(listCustomersCellDeclaration).toMatchObject({
          id: 'customers.list-customers.v1',
          kind: 'query',
          consistency: { transaction: 'none', concurrency: 'none' },
          idempotency: { required: false },
        });
      },
    },

    {
      name: 'decides normalized search and executes invalid cursor data',
      proves: ['decision', 'executor-success'],
      run: async () => {
        expect(validateListCustomers({ ...query, limit: 101 })).toEqual({
          kind: 'validation',
          code: 'user_list_invalid',
        });
        expect(normalizeListCustomersQuery({ ...query, query: '   ' })).toEqual(
          {
            ...query,
            query: null,
          },
        );
        const repository = vi
          .fn()
          .mockResolvedValueOnce({ kind: 'invalid_cursor' as const })
          .mockResolvedValueOnce({
            kind: 'ok' as const,
            value: { items: [], nextCursor: null },
          });
        const execute = makeExecuteListCustomers(repository);

        await expect(
          execute({ ...query, query: '   ', cursor: 'opaque-invalid' }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'validation', code: 'user_cursor_invalid' },
        });
        expect(repository).toHaveBeenCalledWith(
          expect.objectContaining({ query: null }),
        );
        await expect(
          execute({ ...query, query: '   ', cursor: null }),
        ).resolves.toEqual({
          kind: 'success',
          value: { items: [], nextCursor: null },
        });
      },
    },

    {
      name: 'binds the cursor to business and normalized filters',
      proves: ['decision'],
      run: () => {
        const cursor = encodeCustomerCursor(
          { businessId, query: 'Ada', active: true },
          {
            createdAt: new Date('2026-07-29T12:00:00.000Z'),
            id: '00000000-0000-4000-8000-000000000010',
          },
        );

        expect(
          decodeCustomerCursor(
            { businessId, query: 'ada', active: true },
            cursor,
          ),
        ).not.toBeNull();
        expect(
          decodeCustomerCursor(
            {
              businessId: '00000000-0000-4000-8000-000000000200',
              query: 'ada',
              active: true,
            },
            cursor,
          ),
        ).toBeNull();
      },
    },
  ],
});
