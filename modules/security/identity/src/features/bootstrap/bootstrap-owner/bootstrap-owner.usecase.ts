import { result, type Result } from '@pressly/kernel';
import { normalizeEmail } from '@pressly/auth/authentication';
import {
  validatePasswordStrength,
  type PasswordHasher,
} from '@pressly/auth/credentials';
import {
  bootstrapOwnerFailure,
  type BootstrapOwnerFailure,
} from './bootstrap-owner.failure.ts';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';

export const BOOTSTRAP_OWNER_CONFIRMATION = 'bootstrap-first-owner';

export type BootstrapOwnerCommand = Readonly<{
  businessId: string;
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
) => Promise<Result<BootstrapOwnerResult, BootstrapOwnerFailure>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const makeBootstrapOwner =
  (deps: MakeBootstrapOwnerDeps): BootstrapOwner =>
  async (command) => {
    const email = command.email.trim();
    const emailNormalized = normalizeEmail(command.email);

    if (emailNormalized.length === 0)
      return result.err(bootstrapOwnerFailure.missingEmail());
    if (!emailPattern.test(emailNormalized))
      return result.err(bootstrapOwnerFailure.invalidEmail());

    if (command.confirmation !== BOOTSTRAP_OWNER_CONFIRMATION)
      return result.err(bootstrapOwnerFailure.invalidConfirmation());

    const passwordViolations = validatePasswordStrength(command.password);

    if (passwordViolations.length > 0)
      return result.err(bootstrapOwnerFailure.weakPassword(passwordViolations));

    const passwordHash = await deps.passwordHasher.hash(command.password);

    const created = await deps.store.createFirstOwner({
      businessId: command.businessId,
      email,
      emailNormalized,
      passwordHash,
    });

    if (created.status === 'owner_exists')
      return result.err(bootstrapOwnerFailure.ownerExists());

    if (created.status === 'identity_exists')
      return result.err(bootstrapOwnerFailure.identityExists());

    return result.ok({
      identityId: created.identityId,
      email: emailNormalized,
      role: 'owner',
    });
  };
