import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import { normalizeEmail } from '../../../model/authentication/public.ts';
import type {
  PasswordHasher,
  PasswordVerifier,
} from '@pressly/auth-platform/passwords';
import { validatePasswordStrength } from '../../../model/language/password-strength.ts';
import {
  bootstrapOwnerFailure,
  type BootstrapOwnerFailure,
} from './bootstrap-owner.failure.ts';
import type { BootstrapOwnerStore } from './bootstrap-owner.port.ts';
import { BOOTSTRAP_OWNER_CONFIRMATION } from './bootstrap-owner.policy.ts';

export type BootstrapOwnerCommand = Readonly<{
  businessId: string;
  businessSlug: string;
  businessDisplayName: string;
  email: string;
  password: string;
  confirmation: string;
}>;

export type BootstrapOwnerResult = Readonly<{
  identityId: string;
  email: string;
  role: 'owner';
  replayed: boolean;
}>;

type MakeBootstrapOwnerDeps = Readonly<{
  store: BootstrapOwnerStore;
  passwordHasher: PasswordHasher;
  passwordVerifier: PasswordVerifier;
}>;

export type BootstrapOwner = (
  command: BootstrapOwnerCommand,
) => Promise<Result<BootstrapOwnerResult, BootstrapOwnerFailure>>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const businessSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_BOOTSTRAP_OWNER_PASSWORD_LENGTH = 4_096;

const normalizeBusinessDisplayName = (value: string): string =>
  value.trim().replace(/\s+/gu, ' ');

export const makeBootstrapOwner =
  (deps: MakeBootstrapOwnerDeps): BootstrapOwner =>
  async (command) => {
    const email = command.email.trim();
    const emailNormalized = normalizeEmail(command.email);
    const businessSlug = command.businessSlug.trim().toLowerCase();
    const businessDisplayName = normalizeBusinessDisplayName(
      command.businessDisplayName,
    );

    if (emailNormalized.length === 0)
      return result.err(bootstrapOwnerFailure.missingEmail());
    if (!emailPattern.test(emailNormalized))
      return result.err(bootstrapOwnerFailure.invalidEmail());

    if (command.confirmation !== BOOTSTRAP_OWNER_CONFIRMATION)
      return result.err(bootstrapOwnerFailure.invalidConfirmation());

    if (
      businessSlug.length === 0 ||
      businessSlug.length > 100 ||
      !businessSlugPattern.test(businessSlug)
    )
      return result.err(bootstrapOwnerFailure.invalidBusinessSlug());
    if (businessDisplayName.length === 0 || businessDisplayName.length > 200)
      return result.err(bootstrapOwnerFailure.invalidBusinessDisplayName());
    if (command.password.length > MAX_BOOTSTRAP_OWNER_PASSWORD_LENGTH)
      return result.err(bootstrapOwnerFailure.passwordTooLong());

    const passwordViolations = validatePasswordStrength(command.password);

    if (passwordViolations.length > 0)
      return result.err(bootstrapOwnerFailure.weakPassword(passwordViolations));

    const passwordHash = await deps.passwordHasher.hash(command.password);

    const created = await deps.store.createFirstOwner({
      businessId: command.businessId,
      businessSlug,
      businessDisplayName,
      email,
      emailNormalized,
      passwordHash,
      verifyExistingPassword: (storedPasswordHash) =>
        deps.passwordVerifier.verify(storedPasswordHash, command.password),
    });

    if (created.status === 'owner_exists')
      return result.err(bootstrapOwnerFailure.ownerExists());

    if (created.status === 'identity_exists')
      return result.err(bootstrapOwnerFailure.identityExists());
    if (created.status === 'business_conflict')
      return result.err(bootstrapOwnerFailure.businessConflict());
    if (created.status === 'credential_conflict')
      return result.err(bootstrapOwnerFailure.credentialConflict());

    return result.ok({
      identityId: created.identityId,
      email: emailNormalized,
      role: 'owner',
      replayed: created.status === 'replayed',
    });
  };
