import { verify } from 'argon2';
import {
  err,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';

export const makePasswordVerifier = () => ({
  verify: async (
    passwordHash: string,
    plainTextPassword: string,
  ): Promise<Result<boolean, AppError>> => {
    try {
      return ok(await verify(passwordHash, plainTextPassword));
    } catch (error) {
      return err(
        makeAppError({
          kind: 'UnexpectedError',
          code: 'password_verification_failed',
          message: 'Password verification failed.',
          safeMessage: 'Invalid email or password.',
          status: 500,
          cause: error,
        }),
      );
    }
  },
});
