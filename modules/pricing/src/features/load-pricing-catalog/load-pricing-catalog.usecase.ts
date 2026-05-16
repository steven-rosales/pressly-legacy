import type { AppError, Result } from '@pressly/errors';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
} from '@pressly/contracts';
import type { EffectivePricingCatalogFinder } from './load-pricing-catalog.port.js';

export type LoadPricingCatalog = (
  command: LoadPricingCatalogCommand,
) => Promise<Result<LoadPricingCatalogResult, AppError>>;

export const makeLoadPricingCatalog =
  (finder: EffectivePricingCatalogFinder): LoadPricingCatalog =>
  async (command) =>
    finder.findEffectivePricingCatalog(command);
