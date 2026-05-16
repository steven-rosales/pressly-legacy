import type { Database } from '@pressly/db';
import { makePostgresEffectivePricingCatalogFinder } from './adapters/persistence/pricing.repo.ts';
import { makePricingRoutes } from './adapters/http/pricing.routes.ts';
import { makeLoadPricingCatalog } from './features/load-pricing-catalog/load-pricing-catalog.usecase.ts';

export type PricingModuleDeps = Readonly<{ db: Database }>;

export const makePricingModule = ({ db }: PricingModuleDeps) => {
  const effectivePricingCatalogFinder =
    makePostgresEffectivePricingCatalogFinder(db);
  const loadPricingCatalog = makeLoadPricingCatalog(
    effectivePricingCatalogFinder,
  );
  const routes = makePricingRoutes({ loadPricingCatalog });

  return { routes };
};
