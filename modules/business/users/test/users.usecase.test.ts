import { describe, expect, it, vi } from 'vitest';
import type { CreateUserOperations } from '../src/create-user/create-user.port.ts';
import { makeCreateUser } from '../src/create-user/create-user.usecase.ts';
import { hashUserCommand } from '../src/command-execution/user-command-idempotency.policy.ts';
import type { UserTransactionPort } from '../src/persistence/user-transaction.port.ts';
import type { UpdateUserOperations } from '../src/update-user/update-user.port.ts';
import { makeUpdateUser } from '../src/update-user/update-user.usecase.ts';

const transactionRepo = <Operations>(
  operations: Operations,
): UserTransactionPort<Operations> => ({
  transaction: (work) => work(operations),
});

const profile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};
const businessId = '00000000-0000-4000-8000-000000000100';

const user = {
  id: 'user-1',
  businessId,
  version: 1,
  active: true,
  ...profile,
};

const commandOperations = () => ({
  lockCommand: vi.fn(),
  loadCommandReceipt: vi.fn().mockResolvedValue(null),
  saveCommandReceipt: vi.fn(),
});

const createOperations = (
  overrides: Partial<CreateUserOperations> = {},
): CreateUserOperations => ({
  ...commandOperations(),
  createUser: vi.fn().mockResolvedValue(user),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

const updateOperations = (
  overrides: Partial<UpdateUserOperations> = {},
): UpdateUserOperations => ({
  ...commandOperations(),
  lockUser: vi.fn(),
  loadUser: vi.fn().mockResolvedValue(user),
  updateUser: vi.fn(),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

describe('Users use cases', () => {
  const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
  const directContext = {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  } as const;

  it('preserves an exact create replay without creating another User', async () => {
    const command = {
      businessId,
      idempotencyKey: 'create-user-1',
      context: directContext,
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

  it('decides optimistic concurrency before writing a stale update', async () => {
    const updateUser = vi.fn();
    const operations = updateOperations({
      loadUser: vi.fn().mockResolvedValue({ ...user, version: 4 }),
      updateUser,
    });
    const update = makeUpdateUser({ repo: transactionRepo(operations), clock });
    const outcome = await update({
      businessId,
      idempotencyKey: 'update-user-1',
      context: directContext,
      userId: 'user-1',
      expectedVersion: 3,
      changes: { phone: '+12025550123' },
    });

    expect(outcome).toMatchObject({
      tag: 'err',
      error: { code: 'user_version_conflict' },
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('claims Pressly authority only for directly changed profile fields', async () => {
    const updateUser = vi.fn();
    const operations = updateOperations({ updateUser });
    const update = makeUpdateUser({ repo: transactionRepo(operations), clock });
    const outcome = await update({
      businessId,
      idempotencyKey: 'update-user-2',
      context: directContext,
      userId: 'user-1',
      expectedVersion: 1,
      changes: { phone: '+12025550123', active: false },
    });

    expect(outcome.tag).toBe('ok');
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ authorityFields: ['phone'], nextVersion: 2 }),
    );
  });
});
