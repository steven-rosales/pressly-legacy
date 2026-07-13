import type { LoadPricingCatalogCommand } from '@pressly/contracts';

export const makeLoadPricingCatalogCommand = (
  overrides: Partial<LoadPricingCatalogCommand> = {},
): LoadPricingCatalogCommand => ({
  serviceSlug: 'wash-fold',
  ...overrides,
});
