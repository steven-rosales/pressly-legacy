import { hash as argonHash } from 'argon2';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

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
      return ok(await (deps.hashPassword ?? argonHash)(plainTextPassword));
    } catch (error) {
      return err(
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
