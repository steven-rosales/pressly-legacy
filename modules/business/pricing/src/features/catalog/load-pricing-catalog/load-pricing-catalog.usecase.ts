import type { Result } from '@pressly/kernel';
import type { LoadPricingCatalogFailure } from './load-pricing-catalog.failure.ts';
import type {
  LoadPricingCatalogCommand,
  PricingCatalog,
} from './load-pricing-catalog.model.ts';
import type { EffectivePricingCatalogFinder } from './load-pricing-catalog.port.ts';

export type LoadPricingCatalog = (
  command: LoadPricingCatalogCommand,
) => Promise<Result<PricingCatalog, LoadPricingCatalogFailure>>;

export const makeLoadPricingCatalog = (
  finder: EffectivePricingCatalogFinder,
): LoadPricingCatalog => finder.findEffectivePricingCatalog;
