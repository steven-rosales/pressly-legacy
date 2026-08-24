import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it, vi } from 'vitest';
import { getCustomerCellDeclaration } from './cell.ts';
import { getCustomerContract } from './contract.ts';
import { validateGetCustomer } from './decide.ts';
import { makeExecuteGetCustomer } from './execute.ts';

const query = {
  businessId: '00000000-0000-4000-8000-000000000100',
  userId: '00000000-0000-4000-8000-000000000101',
};

proveOperation({
  operationId: 'customers.get-customer.v1',
  declaration: getCustomerCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the strict query contract and read declaration',
      proves: ['contract'],
      run: () => {
        expect(getCustomerContract.input.decode(query)).toEqual({
          kind: 'valid',
          value: query,
        });
        expect(
          getCustomerContract.input.decode({ ...query, extra: true }).kind,
        ).toBe('invalid');
        expect(getCustomerCellDeclaration).toMatchObject({
          id: 'customers.get-customer.v1',
          kind: 'query',
          authentication: 'none',
          authorization: null,
          consistency: { transaction: 'none', concurrency: 'none' },
          idempotency: { required: false },
        });
      },
    },

    {
      name: 'decides malformed identity and executes scoped absence',
      proves: ['decision', 'executor-success'],
      run: async () => {
        expect(validateGetCustomer({ ...query, businessId: '' })).toEqual({
          kind: 'validation',
          code: 'user_get_invalid',
        });
        const at = new Date('2026-08-22T16:00:00.000Z');
        const repository = vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            id: query.userId,
            businessId: query.businessId,
            version: 1,
            active: true,
            firstName: 'Ada',
            lastName: null,
            businessName: null,
            phone: null,
            email: null,
            displayName: 'Ada',
            possibleDuplicateCount: 0,
            createdAt: at,
            updatedAt: at,
          });
        const execute = makeExecuteGetCustomer(repository);

        await expect(execute({ ...query, businessId: '' })).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'validation', code: 'user_get_invalid' },
        });
        expect(repository).not.toHaveBeenCalled();
        await expect(execute(query)).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'user_not_found' },
        });
        await expect(execute(query)).resolves.toMatchObject({
          kind: 'success',
          value: { id: query.userId, displayName: 'Ada' },
        });
      },
    },
  ],
});

it('maps an unexpected read failure through the Customers database rail', async () => {
  const execute = makeExecuteGetCustomer(() =>
    Promise.reject(Object.freeze({ kind: 'fixture-database-fault' })),
  );

  await expect(execute(query)).rejects.toMatchObject({
    tag: 'AppError',
    kind: 'DatabaseError',
    code: 'user_get_failed',
  });
});
