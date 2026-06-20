import { result, type Result } from '@pressly/kernel';
import { hash as argonHash } from 'argon2';
import { makeAppError, type AppError } from '@pressly/errors';

export type PasswordHasher = Readonly<{
  hash: (plainTextPassword: string) => Promise<Result<string, AppError>>;
}>;

type MakePasswordHasherDeps = Readonly<{
  hashPassword?: (plainTextPassword: string) => Promise<string>;
}>;

export const makePasswordHasher = (
  deps: MakePasswordHasherDeps = {},
): PasswordHasher => ({
  hash: async (plainTextPassword) => {
    try {
      return result.ok(
        await (deps.hashPassword ?? argonHash)(plainTextPassword),
      );
    } catch (error) {
      return result.err(
        makeAppError({
          kind: 'UnexpectedError',
          code: 'password_hashing_failed',
          message: 'Password hashing failed.',
          safeMessage: 'Password could not be saved.',
          status: 500,
          cause: error,
        }),
      );
    }
  },
});
