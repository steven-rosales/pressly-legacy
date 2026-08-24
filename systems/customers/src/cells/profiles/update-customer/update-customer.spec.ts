import type { UnitOfWork } from '@pressly/cells/unit-of-work';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import { updateCustomerCellDeclaration } from './cell.ts';
import { updateCustomerContract } from './contract.ts';
import { decideUpdateCustomer, validateUpdateCustomer } from './decide.ts';
import { makeExecuteUpdateCustomer } from './execute.ts';
import type {
  UpdateCustomerCommand,
  UpdateCustomerTransaction,
} from './types.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const businessId = '00000000-0000-4000-8000-000000000100';
const customer = {
  id: 'user-1',
  businessId,
  version: 1,
  active: true,
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};
const command: UpdateCustomerCommand = {
  businessId,
  idempotencyKey: 'update-customer-1',
  context: {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  },
  userId: customer.id,
  expectedVersion: 1,
  changes: { phone: '+12025550123', active: false },
};

const transaction = (
  overrides: Partial<UpdateCustomerTransaction> = {},
): UpdateCustomerTransaction => ({
  lockCommand: vi.fn(),
  loadCommandReceipt: vi.fn().mockResolvedValue(null),
  lockCustomer: vi.fn(),
  loadCustomer: vi.fn().mockResolvedValue(customer),
  updateCustomer: vi.fn(),
  saveCommandReceipt: vi.fn(),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

const unitOfWork = (
  operations: UpdateCustomerTransaction,
): UnitOfWork<UpdateCustomerTransaction> => ({
  transaction: (work) => work(operations),
});

proveOperation({
  operationId: 'customers.update-customer.v1',
  declaration: updateCustomerCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns the strict optimistic command contract',
      proves: ['contract'],
      run: () => {
        expect(updateCustomerContract.input.decode(command)).toEqual({
          kind: 'valid',
          value: command,
        });
        expect(
          updateCustomerContract.input.decode({ ...command, extra: true }).kind,
        ).toBe('invalid');
        expect(updateCustomerCellDeclaration).toMatchObject({
          id: 'customers.update-customer.v1',
          kind: 'command',
          consistency: { transaction: 'required', concurrency: 'optimistic' },
          idempotency: { required: true },
        });
        expect(
          updateCustomerCellDeclaration.consistency.expectedVersion?.(command),
        ).toBe(1);
      },
    },

    {
      name: 'decides version rejection and changed-field authority',
      proves: ['decision'],
      run: () => {
        expect(validateUpdateCustomer({ ...command, changes: {} })).toEqual({
          kind: 'validation',
          code: 'user_update_invalid',
        });
        expect(decideUpdateCustomer(customer, command)).toEqual({
          kind: 'commit',
          nextVersion: 2,
          authorityFields: ['phone'],
        });
        expect(
          decideUpdateCustomer({ ...customer, version: 2 }, command),
        ).toEqual({
          kind: 'reject',
          failure: { kind: 'conflict', code: 'user_version_conflict' },
        });
      },
    },

    {
      name: 'executes optimistic rejection without mutation',
      proves: ['executor-success'],
      run: async () => {
        const updateCustomer = vi.fn();
        const saveCommandReceipt = vi.fn();
        const execute = makeExecuteUpdateCustomer({
          repo: unitOfWork(
            transaction({
              loadCustomer: vi
                .fn()
                .mockResolvedValue({ ...customer, version: 4 }),
              updateCustomer,
              saveCommandReceipt,
            }),
          ),
          clock: { now: () => now },
        });

        await expect(
          execute({ ...command, expectedVersion: 3 }),
        ).resolves.toEqual({
          kind: 'failure',
          failure: { kind: 'conflict', code: 'user_version_conflict' },
        });
        expect(updateCustomer).not.toHaveBeenCalled();
        expect(saveCommandReceipt).not.toHaveBeenCalled();
      },
    },

    {
      name: 'executes changed authority and next version',
      proves: ['executor-success'],
      run: async () => {
        const updateCustomer = vi.fn();
        const execute = makeExecuteUpdateCustomer({
          repo: unitOfWork(transaction({ updateCustomer })),
          clock: { now: () => now },
        });

        await expect(execute(command)).resolves.toMatchObject({
          kind: 'success',
          value: { userId: customer.id, version: 2, replayed: false },
        });
        expect(updateCustomer).toHaveBeenCalledWith(
          expect.objectContaining({
            authorityFields: ['phone'],
            nextVersion: 2,
          }),
        );
      },
    },
  ],
});
