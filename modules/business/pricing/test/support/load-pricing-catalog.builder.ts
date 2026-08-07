import type { LoadPricingCatalogCommand } from '../../src/features/catalog/load-pricing-catalog/load-pricing-catalog.model.ts';

export const makeLoadPricingCatalogCommand = (
  overrides: Partial<LoadPricingCatalogCommand> = {},
): LoadPricingCatalogCommand => ({
  serviceSlug: 'wash-fold',
  ...overrides,
});
