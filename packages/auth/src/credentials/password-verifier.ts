import { verify } from 'argon2';
import { unexpectedError } from '@pressly/errors/factories';

export const makePasswordVerifier = () => ({
  verify: async (
    passwordHash: string,
    plainTextPassword: string,
  ): Promise<boolean> => {
    try {
      return await verify(passwordHash, plainTextPassword);
    } catch (error) {
      throw unexpectedError({
        code: 'password_verification_failed',
        message: 'Password verification failed.',
        safeMessage: 'Invalid email or password.',
        cause: error,
      });
    }
  },
});
