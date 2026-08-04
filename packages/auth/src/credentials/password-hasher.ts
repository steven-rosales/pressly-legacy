import { hash as argonHash } from 'argon2';
import { unexpectedError } from '@pressly/errors/factories';

export type PasswordHasher = Readonly<{
  hash: (plainTextPassword: string) => Promise<string>;
}>;

type MakePasswordHasherDeps = Readonly<{
  hashPassword?: (plainTextPassword: string) => Promise<string>;
}>;

export const makePasswordHasher = (
  deps: MakePasswordHasherDeps = {},
): PasswordHasher => ({
  hash: async (plainTextPassword) => {
    try {
      return await (deps.hashPassword ?? argonHash)(plainTextPassword);
    } catch (error) {
      throw unexpectedError({
        code: 'password_hashing_failed',
        message: 'Password hashing failed.',
        safeMessage: 'Password could not be saved.',
        cause: error,
      });
    }
  },
});
