import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it } from 'vitest';
import { resolveExactSourceCustomerCellDeclaration } from './cell.ts';
import { resolveExactSourceCustomerContract } from './contract.ts';
import { makeExecuteResolveExactSourceCustomer } from './execute.ts';
import { resolveExactSourceCustomerCommandHash } from './idempotency.ts';
import type { ResolveExactSourceCustomerCommand } from './types.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command: ResolveExactSourceCustomerCommand = {
  businessId: '00000000-0000-4000-8000-000000000100',
  source: 'cents',
  externalUserId: 'customer-1',
  profile: {
    firstName: 'Ada',
    lastName: null,
    businessName: null,
    phone: null,
    email: null,
  },
  revision: {
    at: now,
    hash: 'a'.repeat(64),
    adapterVersion: 'cents-v1',
    observedAt: now,
    normalizedPayload: { customer: { id: 'customer-1' } },
  },
  idempotencyKey: 'proposal-1:customer',
  context: {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  },
  now,
};

const customerReference = {
  customerId: 'user-1',
  businessId: command.businessId,
  version: 1,
  active: true,
  profile: command.profile,
} as const;

proveOperation({
  operationId: 'customers.resolve-exact-source-customer.v1',
  declaration: resolveExactSourceCustomerCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the complete source-partitioned contract',
      proves: ['contract'],
      run: () => {
        const encoded =
          resolveExactSourceCustomerContract.input.encode(command);
        expect(
          resolveExactSourceCustomerContract.input.decode(encoded),
        ).toEqual({
          kind: 'valid',
          value: command,
        });
        expect(resolveExactSourceCustomerCellDeclaration).toMatchObject({
          id: 'customers.resolve-exact-source-customer.v1',
          kind: 'command',
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: true },
        });
        expect(
          resolveExactSourceCustomerCellDeclaration.consistency.concurrencyKey?.(
            command,
          ),
        ).toBe('cents:customer-1');
        expect(
          resolveExactSourceCustomerCellDeclaration.idempotency.fingerprint?.(
            command,
          ),
        ).toBe(resolveExactSourceCustomerCommandHash(command));
      },
    },

    {
      name: 'decides an expected cross-business identity conflict',
      proves: ['decision'],
      run: async () => {
        const execute = makeExecuteResolveExactSourceCustomer({
          transaction: async (work) =>
            work(async () => ({
              kind: 'failure',
              failure: {
                kind: 'conflict',
                code: 'canonical_source_user_business_conflict',
              },
            })),
        });

        await expect(execute(command)).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'conflict',
            code: 'canonical_source_user_business_conflict',
          },
        });
      },
    },

    {
      name: 'executes one canonical source-customer resolution',
      proves: ['executor-success'],
      run: async () => {
        const execute = makeExecuteResolveExactSourceCustomer({
          transaction: async (work) =>
            work(async () => ({
              kind: 'success',
              value: { customer: customerReference, created: true },
            })),
        });
        await expect(execute(command)).resolves.toEqual({
          kind: 'success',
          value: { customer: customerReference, created: true },
        });
      },
    },
  ],
});

it('maps an unexpected transaction failure through the operation error identity', async () => {
  const execute = makeExecuteResolveExactSourceCustomer({
    transaction: () =>
      Promise.reject(Object.freeze({ kind: 'fixture-database-fault' })),
  });

  await expect(execute(command)).rejects.toMatchObject({
    tag: 'AppError',
    kind: 'DatabaseError',
    code: 'canonical_source_user_resolution_failed',
  });
});
