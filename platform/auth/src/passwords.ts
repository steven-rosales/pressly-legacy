import { hash as argonHash, verify as argonVerify } from 'argon2';
import { unexpectedError } from '@pressly/errors/factories';

export type PasswordHasher = Readonly<{
  hash: (plainTextPassword: string) => Promise<string>;
}>;

export type PasswordVerifier = Readonly<{
  verify: (passwordHash: string, plainTextPassword: string) => Promise<boolean>;
}>;

export type MakePasswordHasherDependencies = Readonly<{
  hashPassword?: (plainTextPassword: string) => Promise<string>;
  hashFailure?: (cause: unknown) => Error;
}>;

export type MakePasswordVerifierDependencies = Readonly<{
  verifyPassword?: (
    passwordHash: string,
    plainTextPassword: string,
  ) => Promise<boolean>;
  verificationFailure?: (cause: unknown) => Error;
}>;

const defaultHashFailure = (cause: unknown): Error =>
  unexpectedError({
    code: 'password_hash_operation_failed',
    message: 'Password hash operation failed.',
    safeMessage: 'The credential operation failed.',
    cause,
  });

const defaultVerificationFailure = (cause: unknown): Error =>
  unexpectedError({
    code: 'password_verification_operation_failed',
    message: 'Password verification operation failed.',
    safeMessage: 'The credential operation failed.',
    cause,
  });

export const makePasswordHasher = (
  dependencies: MakePasswordHasherDependencies = {},
): PasswordHasher => ({
  hash: async (plainTextPassword) => {
    try {
      return await (dependencies.hashPassword ?? argonHash)(plainTextPassword);
    } catch (error) {
      throw (dependencies.hashFailure ?? defaultHashFailure)(error);
    }
  },
});

export const makePasswordVerifier = (
  dependencies: MakePasswordVerifierDependencies = {},
): PasswordVerifier => ({
  verify: async (passwordHash, plainTextPassword) => {
    try {
      return await (dependencies.verifyPassword ?? argonVerify)(
        passwordHash,
        plainTextPassword,
      );
    } catch (error) {
      throw (dependencies.verificationFailure ?? defaultVerificationFailure)(
        error,
      );
    }
  },
});
