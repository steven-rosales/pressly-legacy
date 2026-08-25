import { describe, expect, it } from 'vitest';
import { proveOperation } from '@pressly/testkit/operation-proof';
import type {
  PasswordHasher,
  PasswordVerifier,
} from '@pressly/auth-platform/passwords';
import { makeAppError, type AppError } from '@pressly/errors/app-error';
import type {
  BootstrapOwnerStoreResult,
  CreateBootstrapOwnerInput,
} from './bootstrap-owner.port.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';
import { makeBootstrapOwner } from './bootstrap-owner.usecase.ts';
import { BOOTSTRAP_OWNER_CONFIRMATION } from './bootstrap-owner.policy.ts';
import { bootstrapOwnerCellDeclaration } from './cell.ts';

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
  const passwordVerifier: PasswordVerifier = {
    verify: async () => true,
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
    bootstrapOwner: makeBootstrapOwner({
      store,
      passwordHasher,
      passwordVerifier,
    }),
    calls,
  };
};

const validCommand = {
  businessId: '00000000-0000-4000-8000-000000000100',
  businessSlug: ' Pressly-One ',
  businessDisplayName: ' Pressly   Laundry ',
  email: ' Steven@Pressly.COM ',
  password: 'CorrectHorse1!Battery',
  confirmation: BOOTSTRAP_OWNER_CONFIRMATION,
};

describe('bootstrap owner', () => {
  proveOperation({
    operationId: 'access.bootstrap-owner.v2',
    declaration: bootstrapOwnerCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'validates normalizes hashes and creates the first owner',
        proves: ['contract', 'decision', 'executor-success'],
        run: async () => {
          expect(
            bootstrapOwnerCellDeclaration.contract.input.decode(validCommand)
              .kind,
          ).toBe('valid');
          const { bootstrapOwner, calls } = makeSubject();

          const actual = await bootstrapOwner(validCommand);

          expect(expectOk(actual)).toEqual({
            identityId: '00000000-0000-4000-8000-000000000001',
            email: 'steven@pressly.com',
            role: 'owner',
            replayed: false,
          });
          expect(calls.hash).toEqual(['CorrectHorse1!Battery']);
          expect(calls.createFirstOwner).toEqual([
            {
              businessId: '00000000-0000-4000-8000-000000000100',
              businessSlug: 'pressly-one',
              businessDisplayName: 'Pressly Laundry',
              email: 'Steven@Pressly.COM',
              emailNormalized: 'steven@pressly.com',
              passwordHash: 'stored-password-hash',
              verifyExistingPassword: expect.any(Function),
            },
          ]);
        },
      },
      {
        name: 'rejects an invalid normalized business slug before effects',
        proves: ['decision', 'expected-rejection-no-partial-write'],
        run: async () => {
          const { bootstrapOwner, calls } = makeSubject();
          expectErrCode(
            await bootstrapOwner({
              ...validCommand,
              businessSlug: 'not valid',
            }),
            'invalid_bootstrap_business_slug',
          );
          expect(calls.hash).toEqual([]);
          expect(calls.createFirstOwner).toEqual([]);
        },
      },
      {
        name: 'rejects an empty normalized business display name before effects',
        proves: ['decision', 'expected-rejection-no-partial-write'],
        run: async () => {
          const { bootstrapOwner, calls } = makeSubject();
          expectErrCode(
            await bootstrapOwner({
              ...validCommand,
              businessDisplayName: '   ',
            }),
            'invalid_bootstrap_business_display_name',
          );
          expect(calls.hash).toEqual([]);
          expect(calls.createFirstOwner).toEqual([]);
        },
      },
      {
        name: 'rejects an oversized owner password before credential effects',
        proves: ['decision', 'expected-rejection-no-partial-write'],
        run: async () => {
          const { bootstrapOwner, calls } = makeSubject();
          expectErrCode(
            await bootstrapOwner({
              ...validCommand,
              password: 'A'.repeat(4_097),
            }),
            'bootstrap_owner_password_too_long',
          );
          expect(calls.hash).toEqual([]);
          expect(calls.createFirstOwner).toEqual([]);
        },
      },
    ],
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

  it('returns an explicit replay without changing the public owner identity', async () => {
    const { bootstrapOwner } = makeSubject({
      storeResult: {
        status: 'replayed',
        identityId: '00000000-0000-4000-8000-000000000001',
      },
    });

    expect(expectOk(await bootstrapOwner(validCommand))).toEqual({
      identityId: '00000000-0000-4000-8000-000000000001',
      email: 'steven@pressly.com',
      role: 'owner',
      replayed: true,
    });
  });

  it('returns a typed conflict for incompatible business facts', async () => {
    const { bootstrapOwner } = makeSubject({
      storeResult: { status: 'business_conflict' },
    });

    expectErrCode(
      await bootstrapOwner(validCommand),
      'bootstrap_owner_business_conflict',
    );
  });

  it('returns a typed conflict for a divergent replay password', async () => {
    const { bootstrapOwner } = makeSubject({
      storeResult: { status: 'credential_conflict' },
    });

    expectErrCode(
      await bootstrapOwner(validCommand),
      'bootstrap_owner_credential_conflict',
    );
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
