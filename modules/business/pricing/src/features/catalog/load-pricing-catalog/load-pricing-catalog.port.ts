import type { Result } from '@pressly/kernel';
import type { LoadPricingCatalogFailure } from './load-pricing-catalog.failure.ts';
import type {
  LoadPricingCatalogCommand,
  PricingCatalog,
} from './load-pricing-catalog.model.ts';

export type EffectivePricingCatalogFinder = Readonly<{
  findEffectivePricingCatalog: (
    command: LoadPricingCatalogCommand,
  ) => Promise<Result<PricingCatalog, LoadPricingCatalogFailure>>;
}>;
