import { result, type Result } from '@pressly/kernel';
import {
  normalizeEmail,
  validatePasswordStrength,
  type PasswordHasher,
} from '@pressly/auth';
import type {
  BootstrapOwnerCommand,
  BootstrapOwnerResult,
} from '@pressly/contracts';
import { type AppError } from '@pressly/errors';
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

    if (emailNormalized.length === 0)
      return result.err(missingBootstrapOwnerEmail());
    if (!emailPattern.test(emailNormalized))
      return result.err(invalidBootstrapOwnerEmail());

    if (command.confirmation !== BOOTSTRAP_OWNER_CONFIRMATION)
      return result.err(invalidBootstrapOwnerConfirmation());

    const passwordViolations = validatePasswordStrength(command.password);

    if (passwordViolations.length > 0)
      return result.err(weakBootstrapOwnerPassword(passwordViolations));

    const passwordHash = await deps.passwordHasher.hash(command.password);

    if (result.isErr(passwordHash)) return passwordHash;

    const created = await deps.store.createFirstOwner({
      email,
      emailNormalized,
      passwordHash: passwordHash.value,
    });

    if (result.isErr(created)) return created;

    if (created.value.status === 'owner_exists')
      return result.err(ownerAlreadyBootstrapped());

    if (created.value.status === 'identity_exists')
      return result.err(bootstrapOwnerIdentityAlreadyExists());

    return result.ok({
      identityId: created.value.identityId,
      email: emailNormalized,
      role: 'owner',
    });
  };
