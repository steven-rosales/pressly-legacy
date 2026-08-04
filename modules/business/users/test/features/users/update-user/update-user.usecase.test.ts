import type { UnitOfWork } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateUserOperations } from '../../../../src/features/users/update-user/update-user.port.ts';
import { makeUpdateUser } from '../../../../src/features/users/update-user/update-user.usecase.ts';

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

const updateOperations = (
  overrides: Partial<UpdateUserOperations> = {},
): UpdateUserOperations => ({
  lockCommand: vi.fn(),
  loadCommandReceipt: vi.fn().mockResolvedValue(null),
  saveCommandReceipt: vi.fn(),
  lockUser: vi.fn(),
  loadUser: vi.fn().mockResolvedValue(user),
  updateUser: vi.fn(),
  signalDuplicateContacts: vi.fn(),
  ...overrides,
});

describe('update User', () => {
  const clock = { now: () => new Date('2026-07-21T12:00:00.000Z') };
  const context = {
    origin: 'pressly_dashboard',
    principal: { kind: 'human', id: 'identity-1' },
  } as const;

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
      context,
      userId: 'user-1',
      expectedVersion: 3,
      changes: { phone: '+12025550123' },
    });

    expect(outcome).toEqual({
      tag: 'err',
      error: { kind: 'conflict', code: 'user_version_conflict' },
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
      context,
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
