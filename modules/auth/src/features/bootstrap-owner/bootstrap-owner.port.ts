import type {
  BootstrapOwnerStoreResult,
  CreateBootstrapOwnerInput,
} from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

export type BootstrapOwnerStore = Readonly<{
  createFirstOwner: (
    input: CreateBootstrapOwnerInput,
  ) => Promise<Result<BootstrapOwnerStoreResult, AppError>>;
}>;
