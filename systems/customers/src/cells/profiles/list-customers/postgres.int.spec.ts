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
import { listCustomersCellDeclaration } from './cell.ts';

registerCustomersPostgresLifecycle();

proveOperation({
  operationId: 'customers.list-customers.v1',
  declaration: listCustomersCellDeclaration,
  layer: 'postgres',
  scenarios: [
    {
      name: 'filtered_projection_and_cursor_binding',
      proves: ['executor-success'],
      run: async () => {
        const system = makeCustomersPostgresSystem();
        await system.cells.createCustomer.execute({
          businessId: customersBusinessId,
          idempotencyKey: 'read-customer-1',
          context: customersCommandContext,
          profile: {
            ...emptyCustomerProfile,
            firstName: 'Ada',
            lastName: 'Lovelace',
            phone: '+12015550101',
          },
        });
        await system.cells.createCustomer.execute({
          businessId: customersBusinessId,
          idempotencyKey: 'read-customer-2',
          context: customersCommandContext,
          profile: {
            ...emptyCustomerProfile,
            businessName: 'Pressly Customer',
            phone: '+12015550101',
          },
        });

        const firstPage = await system.cells.listCustomers.execute({
          businessId: customersBusinessId,
          query: null,
          active: null,
          limit: 1,
          cursor: null,
        });
        expect(firstPage).toMatchObject({ kind: 'success' });
        if (firstPage.kind === 'failure') return;
        expect(firstPage.value.nextCursor).not.toBeNull();
        const secondPage = await system.cells.listCustomers.execute({
          businessId: customersBusinessId,
          query: null,
          active: null,
          limit: 1,
          cursor: firstPage.value.nextCursor,
        });
        expect(secondPage).toMatchObject({
          kind: 'success',
          value: { nextCursor: null },
        });
        if (secondPage.kind === 'failure') return;
        expect(
          [...firstPage.value.items, ...secondPage.value.items]
            .map(({ displayName, possibleDuplicateCount }) => ({
              displayName,
              possibleDuplicateCount,
            }))
            .sort((left, right) =>
              left.displayName.localeCompare(right.displayName),
            ),
        ).toEqual([
          { displayName: 'Ada Lovelace', possibleDuplicateCount: 0 },
          { displayName: 'Pressly Customer', possibleDuplicateCount: 1 },
        ]);
        await expect(
          system.cells.listCustomers.execute({
            businessId: customersOtherBusinessId,
            query: null,
            active: null,
            limit: 1,
            cursor: firstPage.value.nextCursor,
          }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'validation', code: 'user_cursor_invalid' },
        });
      },
    },
  ],
});
