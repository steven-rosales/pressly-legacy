import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it, vi } from 'vitest';
import { createCustomerCellDeclaration } from './cell.ts';
import { createCustomerContract } from './contract.ts';
import { validateCreateCustomer } from './decide.ts';
import {
  createCustomerCommandHash,
  makeExecuteCreateCustomer,
} from './execute.ts';
import type {
  CreateCustomerCommand,
  CreateCustomerTransaction,
} from './types.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const command: CreateCustomerCommand = {
  businessId: '00000000-0000-4000-8000-000000000100',
  idempotencyKey: 'create-customer-1',
  context: {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  },
  profile: {
    firstName: null,
    lastName: null,
    businessName: null,
    phone: null,
    email: null,
  },
};
const customer = {
  id: 'user-1',
  businessId: command.businessId,
  version: 1,
  active: true,
  ...command.profile,
};

const transaction = (
  overrides: Partial<CreateCustomerTransaction> = {},
): CreateCustomerTransaction => ({
  lockCommand: vi.fn(),
  loadCommandReceipt: vi.fn().mockResolvedValue(null),
  createCustomer: vi.fn().mockResolvedValue(customer),
  saveCommandReceipt: vi.fn(),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

const unitOfWork = (
  operations: CreateCustomerTransaction,
): UnitOfWork<CreateCustomerTransaction> => ({
  transaction: (work) => work(operations),
});

proveOperation({
  operationId: 'customers.create-customer.v1',
  declaration: createCustomerCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the strict command contract and write declaration',
      proves: ['contract'],
      run: () => {
        expect(createCustomerContract.input.decode(command)).toEqual({
          kind: 'valid',
          value: command,
        });
        expect(
          createCustomerContract.input.decode({ ...command, extra: true }).kind,
        ).toBe('invalid');
        expect(createCustomerCellDeclaration).toMatchObject({
          id: 'customers.create-customer.v1',
          kind: 'command',
          authentication: 'none',
          authorization: null,
          consistency: { transaction: 'required', concurrency: 'partitioned' },
          idempotency: { required: true },
        });
        expect(
          createCustomerCellDeclaration.consistency.concurrencyKey?.(command),
        ).toBe(command.idempotencyKey);
      },
    },

    {
      name: 'decides invalid input before transaction effects',
      proves: ['decision'],
      run: async () => {
        expect(
          validateCreateCustomer({ ...command, idempotencyKey: '' }),
        ).toEqual({
          kind: 'validation',
          code: 'user_idempotency_key_required',
        });
        const openTransaction = vi.fn();
        const execute = makeExecuteCreateCustomer({
          repo: { transaction: openTransaction },
          clock: { now: () => now },
        });

        await expect(
          execute({ ...command, idempotencyKey: '' }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: {
            kind: 'validation',
            code: 'user_idempotency_key_required',
          },
        });
        expect(openTransaction).not.toHaveBeenCalled();
      },
    },

    {
      name: 'executes a same-payload receipt without duplicate effects',
      proves: ['executor-success'],
      run: async () => {
        const createCustomer = vi.fn();
        const signalDuplicateContacts = vi.fn();
        const execute = makeExecuteCreateCustomer({
          repo: unitOfWork(
            transaction({
              loadCommandReceipt: vi.fn().mockResolvedValue({
                commandHash: createCustomerCommandHash(command),
                result: { userId: customer.id, version: 1, replayed: false },
              }),
              createCustomer,
              signalDuplicateContacts,
            }),
          ),
          clock: { now: () => now },
        });

        await expect(execute(command)).resolves.toEqual({
          kind: 'success',
          value: { userId: customer.id, version: 1, replayed: true },
        });
        expect(createCustomer).not.toHaveBeenCalled();
        expect(signalDuplicateContacts).not.toHaveBeenCalled();
      },
    },
  ],
});

it('maps an unexpected repository failure to the operation-owned database error', async () => {
  const execute = makeExecuteCreateCustomer({
    repo: {
      transaction: () =>
        Promise.reject(Object.freeze({ kind: 'fixture-database-fault' })),
    },
    clock: { now: () => now },
  });

  await expect(execute(command)).rejects.toMatchObject({
    tag: 'AppError',
    kind: 'DatabaseError',
    code: 'user_create_failed',
  });
});
