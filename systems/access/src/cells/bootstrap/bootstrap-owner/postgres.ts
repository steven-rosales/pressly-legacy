import {
  makePasswordHasher,
  makePasswordVerifier,
  type MakePasswordHasherDependencies,
  type MakePasswordVerifierDependencies,
} from '@pressly/auth-platform/passwords';
import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  passwordHashingFailed,
  passwordVerificationFailed,
} from '../../../credential-mechanism-failures.ts';
import type { AccessSchema } from '../../../schema/public.ts';
import { makeBootstrapOwnerStore } from './bootstrap-owner.repo.ts';
import {
  makeBootstrapOwner,
  type BootstrapOwner,
} from './bootstrap-owner.usecase.ts';

export type PostgresBootstrapOwnerDependencies = Pick<
  MakePasswordHasherDependencies,
  'hashPassword'
> &
  Pick<MakePasswordVerifierDependencies, 'verifyPassword'>;

export const makePostgresBootstrapOwner = (
  db: PostgresDatabase,
  schema: AccessSchema,
  dependencies: PostgresBootstrapOwnerDependencies = {},
): BootstrapOwner =>
  makeBootstrapOwner({
    store: makeBootstrapOwnerStore(db, schema),
    passwordHasher: makePasswordHasher({
      ...(dependencies.hashPassword === undefined
        ? {}
        : { hashPassword: dependencies.hashPassword }),
      hashFailure: passwordHashingFailed,
    }),
    passwordVerifier: makePasswordVerifier({
      ...(dependencies.verifyPassword === undefined
        ? {}
        : { verifyPassword: dependencies.verifyPassword }),
      verificationFailure: passwordVerificationFailed,
    }),
  });
