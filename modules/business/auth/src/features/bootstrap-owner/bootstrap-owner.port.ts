import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';

export type CreateBootstrapOwnerInput = Readonly<{
  email: string;
  emailNormalized: string;
  passwordHash: string;
}>;

export type BootstrapOwnerStoreResult =
  | Readonly<{
      status: 'created';
      identityId: string;
    }>
  | Readonly<{ status: 'owner_exists' }>
  | Readonly<{ status: 'identity_exists' }>;

export type BootstrapOwnerStore = Readonly<{
  createFirstOwner: (
    input: CreateBootstrapOwnerInput,
  ) => Promise<Result<BootstrapOwnerStoreResult, AppError>>;
}>;
