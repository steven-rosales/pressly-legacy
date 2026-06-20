import type { Result } from '@pressly/kernel';
import type {
  BootstrapOwnerStoreResult,
  CreateBootstrapOwnerInput,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';

export type BootstrapOwnerStore = Readonly<{
  createFirstOwner: (
    input: CreateBootstrapOwnerInput,
  ) => Promise<Result<BootstrapOwnerStoreResult, AppError>>;
}>;
