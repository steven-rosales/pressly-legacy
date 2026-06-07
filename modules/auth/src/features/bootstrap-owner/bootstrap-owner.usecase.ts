import {
  normalizeEmail,
  validatePasswordStrength,
  type PasswordHasher,
} from '@pressly/auth';
import { err, ok, type AppError, type Result } from '@pressly/errors';
import {
  bootstrapOwnerIdentityAlreadyExists,
  invalidBootstrapOwnerConfirmation,
  invalidBootstrapOwnerEmail,
  missingBootstrapOwnerEmail,
  ownerAlreadyBootstrapped,
  weakBootstrapOwnerPassword,
} from './bootstrap-owner.error.ts';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';

export const BOOTSTRAP_OWNER_CONFIRMATION = 'bootstrap-first-owner';

export type BootstrapOwnerCommand = Readonly<{
  email: string;
  password: string;
  confirmation: string;
}>;

export type BootstrapOwnerResult = Readonly<{
  identityId: string;
  email: string;
  role: 'owner';
}>;

type MakeBootstrapOwnerDeps = Readonly<{
  store: BootstrapOwnerStore;
  passwordHasher: PasswordHasher;
}>;

export type BootstrapOwner = (
  command: BootstrapOwnerCommand,
) => Promise<Result<BootstrapOwnerResult, AppError>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const makeBootstrapOwner =
  (deps: MakeBootstrapOwnerDeps): BootstrapOwner =>
  async (command) => {
    const email = command.email.trim();
    const emailNormalized = normalizeEmail(command.email);

    if (emailNormalized.length === 0) return err(missingBootstrapOwnerEmail());
    if (!emailPattern.test(emailNormalized))
      return err(invalidBootstrapOwnerEmail());

    if (command.confirmation !== BOOTSTRAP_OWNER_CONFIRMATION)
      return err(invalidBootstrapOwnerConfirmation());

    const passwordViolations = validatePasswordStrength(command.password);

    if (passwordViolations.length > 0)
      return err(weakBootstrapOwnerPassword(passwordViolations));

    const passwordHash = await deps.passwordHasher.hash(command.password);

    if (!passwordHash.ok) return passwordHash;

    const created = await deps.store.createFirstOwner({
      email,
      emailNormalized,
      passwordHash: passwordHash.value,
    });

    if (!created.ok) return created;

    if (created.value.status === 'owner_exists')
      return err(ownerAlreadyBootstrapped());

    if (created.value.status === 'identity_exists')
      return err(bootstrapOwnerIdentityAlreadyExists());

    return ok({
      identityId: created.value.identityId,
      email: emailNormalized,
      role: 'owner',
    });
  };
