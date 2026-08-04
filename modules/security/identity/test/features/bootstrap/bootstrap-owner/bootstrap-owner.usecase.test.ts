import { describe, expect, it } from 'vitest';
import type { PasswordHasher } from '@pressly/auth/credentials';
import { makeAppError, type AppError } from '@pressly/errors/app-error';
import type {
  BootstrapOwnerStoreResult,
  CreateBootstrapOwnerInput,
} from '../../../../src/features/bootstrap/bootstrap-owner/bootstrap-owner.port.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import type { BootstrapOwnerStore } from '../../../../src/features/bootstrap/bootstrap-owner/bootstrap-owner.port.ts';
import {
  BOOTSTRAP_OWNER_CONFIRMATION,
  makeBootstrapOwner,
} from '../../../../src/features/bootstrap/bootstrap-owner/bootstrap-owner.usecase.ts';

const dependencyError = (code: string): AppError =>
  makeAppError({
    kind: 'UnexpectedError',
    code,
    message: 'Dependency failed.',
    status: 500,
  });

const makeSubject = (
  options: {
    hashError?: AppError;
    storeError?: AppError;
    storeResult?: BootstrapOwnerStoreResult;
  } = {},
) => {
  const calls = {
    hash: [] as string[],
    createFirstOwner: [] as CreateBootstrapOwnerInput[],
  };

  const passwordHasher: PasswordHasher = {
    async hash(plainTextPassword) {
      calls.hash.push(plainTextPassword);
      if (options.hashError !== undefined) throw options.hashError;
      return 'stored-password-hash';
    },
  };

  const store: BootstrapOwnerStore = {
    async createFirstOwner(input) {
      calls.createFirstOwner.push(input);
      if (options.storeError !== undefined) throw options.storeError;
      return (
        options.storeResult ?? {
          status: 'created',
          identityId: '00000000-0000-4000-8000-000000000001',
        }
      );
    },
  };

  return {
    bootstrapOwner: makeBootstrapOwner({ store, passwordHasher }),
    calls,
  };
};

const validCommand = {
  businessId: '00000000-0000-4000-8000-000000000100',
  email: ' Steven@Pressly.COM ',
  password: 'CorrectHorse1!Battery',
  confirmation: BOOTSTRAP_OWNER_CONFIRMATION,
};

describe('bootstrap owner', () => {
  it('hashes the password and creates the first owner', async () => {
    const { bootstrapOwner, calls } = makeSubject();

    const actual = await bootstrapOwner(validCommand);

    expect(expectOk(actual)).toEqual({
      identityId: '00000000-0000-4000-8000-000000000001',
      email: 'steven@pressly.com',
      role: 'owner',
    });
    expect(calls.hash).toEqual(['CorrectHorse1!Battery']);
    expect(calls.createFirstOwner).toEqual([
      {
        businessId: '00000000-0000-4000-8000-000000000100',
        email: 'Steven@Pressly.COM',
        emailNormalized: 'steven@pressly.com',
        passwordHash: 'stored-password-hash',
      },
    ]);
  });

  it('rejects missing email before hashing', async () => {
    const { bootstrapOwner, calls } = makeSubject();

    const actual = await bootstrapOwner({ ...validCommand, email: '   ' });

    expectErrCode(actual, 'missing_bootstrap_owner_email');
    expect(calls.hash).toEqual([]);
    expect(calls.createFirstOwner).toEqual([]);
  });

  it('rejects invalid email before hashing', async () => {
    const { bootstrapOwner, calls } = makeSubject();

    const actual = await bootstrapOwner({
      ...validCommand,
      email: 'not-an-email',
    });

    expectErrCode(actual, 'invalid_bootstrap_owner_email');
    expect(calls.hash).toEqual([]);
    expect(calls.createFirstOwner).toEqual([]);
  });

  it('rejects an invalid confirmation before hashing', async () => {
    const { bootstrapOwner, calls } = makeSubject();

    const actual = await bootstrapOwner({
      ...validCommand,
      confirmation: 'wrong-confirmation',
    });

    expectErrCode(actual, 'invalid_bootstrap_owner_confirmation');
    expect(calls.hash).toEqual([]);
    expect(calls.createFirstOwner).toEqual([]);
  });

  it('rejects weak passwords before hashing', async () => {
    const { bootstrapOwner, calls } = makeSubject();

    const actual = await bootstrapOwner({
      ...validCommand,
      password: 'weak',
    });

    const error = expectErrCode(actual, 'weak_bootstrap_owner_password');

    expect(error).toMatchObject({
      violations: expect.arrayContaining([
        'password_too_short',
        'password_requires_uppercase',
        'password_requires_number',
        'password_requires_symbol',
      ]),
    });
    expect(calls.hash).toEqual([]);
    expect(calls.createFirstOwner).toEqual([]);
  });

  it('throws password hashing errors before creating the owner', async () => {
    const { bootstrapOwner, calls } = makeSubject({
      hashError: dependencyError('password_hashing_failed'),
    });

    await expect(bootstrapOwner(validCommand)).rejects.toMatchObject({
      code: 'password_hashing_failed',
    });
    expect(calls.createFirstOwner).toEqual([]);
  });

  it('rejects when an owner already exists', async () => {
    const { bootstrapOwner } = makeSubject({
      storeResult: { status: 'owner_exists' },
    });

    const actual = await bootstrapOwner(validCommand);

    expectErrCode(actual, 'owner_already_bootstrapped');
  });

  it('rejects when the email already belongs to an identity', async () => {
    const { bootstrapOwner } = makeSubject({
      storeResult: { status: 'identity_exists' },
    });

    const actual = await bootstrapOwner(validCommand);

    expectErrCode(actual, 'bootstrap_owner_identity_already_exists');
  });

  it('throws store errors', async () => {
    const { bootstrapOwner } = makeSubject({
      storeError: dependencyError('bootstrap_store_failed'),
    });

    await expect(bootstrapOwner(validCommand)).rejects.toMatchObject({
      code: 'bootstrap_store_failed',
    });
  });
});
