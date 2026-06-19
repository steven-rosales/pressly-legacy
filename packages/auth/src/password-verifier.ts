import { result, type Result } from '@pressly/kernel';
import { verify } from 'argon2';
import { makeAppError, type AppError } from '@pressly/errors';

export const makePasswordVerifier = () => ({
  verify: async (
    passwordHash: string,
    plainTextPassword: string,
  ): Promise<Result<boolean, AppError>> => {
    try {
      return result.ok(await verify(passwordHash, plainTextPassword));
    } catch (error) {
      return result.err(
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
