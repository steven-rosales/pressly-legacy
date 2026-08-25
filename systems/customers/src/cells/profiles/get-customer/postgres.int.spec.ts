import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import {
  customersBusinessId,
  customersCommandContext,
  customersOtherBusinessId,
  emptyCustomerProfile,
  makeCustomersPostgresSystem,
  registerCustomersPostgresLifecycle,
} from '../../../testing/customers-postgres.fixture.ts';
import { getCustomerCellDeclaration } from './cell.ts';

registerCustomersPostgresLifecycle();

proveOperation({
  operationId: 'customers.get-customer.v1',
  declaration: getCustomerCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'business_scoped_read',
      proves: ['executor-success'],
      run: async () => {
        const system = makeCustomersPostgresSystem();
        const created = await system.cells.createCustomer.execute({
          businessId: customersBusinessId,
          idempotencyKey: 'create-before-get',
          context: customersCommandContext,
          profile: { ...emptyCustomerProfile, firstName: 'Ada' },
        });
        expect(created.kind).toBe('success');
        if (created.kind === 'failure') return;

        await expect(
          system.cells.getCustomer.execute({
            businessId: customersBusinessId,
            userId: created.value.userId,
          }),
        ).resolves.toMatchObject({
          kind: 'success',
          value: {
            id: created.value.userId,
            businessId: customersBusinessId,
            displayName: 'Ada',
          },
        });
        await expect(
          system.cells.getCustomer.execute({
            businessId: customersOtherBusinessId,
            userId: created.value.userId,
          }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'not_found', code: 'user_not_found' },
        });
      },
    },
  ],
});
