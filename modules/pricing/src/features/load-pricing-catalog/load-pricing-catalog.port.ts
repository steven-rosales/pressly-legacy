import type { Result } from '@pressly/kernel';
import type { AppError } from '@pressly/errors';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
} from '@pressly/contracts';

export type EffectivePricingCatalogFinder = Readonly<{
  findEffectivePricingCatalog: (
    command: LoadPricingCatalogCommand,
  ) => Promise<Result<LoadPricingCatalogResult, AppError>>;
}>;
