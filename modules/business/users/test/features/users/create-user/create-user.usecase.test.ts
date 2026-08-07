import type { UnitOfWork } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { CreateUserOperations } from '../../../../src/features/users/create-user/create-user.port.ts';
import { makeCreateUser } from '../../../../src/features/users/create-user/create-user.usecase.ts';
import { hashUserCommand } from '../../../../src/foundations/language/command-identity/user-command-identity.policy.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): UnitOfWork<Operations> => ({
  transaction: (work) => work(operations),
});

const businessId = '00000000-0000-4000-8000-000000000100';
const profile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};
const user = {
  id: 'user-1',
  businessId,
  version: 1,
  active: true,
  ...profile,
};

const createOperations = (
  overrides: Partial<CreateUserOperations> = {},
): CreateUserOperations => ({
  lockCommand: vi.fn(),
  loadCommandReceipt: vi.fn().mockResolvedValue(null),
  saveCommandReceipt: vi.fn(),
  createUser: vi.fn().mockResolvedValue(user),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

describe('create User', () => {
  const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
  const context = {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  } as const;

  it('preserves an exact replay without creating another User', async () => {
    const command = {
      businessId,
      idempotencyKey: 'create-user-1',
      context,
      profile,
    };
    const createUser = vi.fn();
    const operations = createOperations({
      loadCommandReceipt: vi.fn().mockResolvedValue({
        commandHash: hashUserCommand(command),
        result: { userId: 'user-1', version: 1, replayed: false },
      }),
      createUser,
    });
    const create = makeCreateUser({ repo: transactionRepo(operations), clock });

    await expect(create(command)).resolves.toEqual({
      tag: 'ok',
      value: { userId: 'user-1', version: 1, replayed: true },
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it('returns expected validation as typed feature data', async () => {
    const create = makeCreateUser({
      repo: transactionRepo(createOperations()),
      clock,
    });

    await expect(
      create({ businessId, idempotencyKey: '', context, profile }),
    ).resolves.toEqual({
      tag: 'err',
      error: {
        kind: 'validation',
        code: 'user_idempotency_key_required',
      },
    });
  });
});
