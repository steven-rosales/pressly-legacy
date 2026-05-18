import type { Database } from '@pressly/db';
import { makeLoadPricingCatalogRoutes } from './adapters/load-pricing-catalog/http/load-pricing-catalog.routes.ts';
import { makePostgresEffectivePricingCatalogFinder } from './adapters/load-pricing-catalog/persistence/postgres-effective-pricing-catalog.finder.ts';
import { makeLoadPricingCatalog } from './features/load-pricing-catalog/load-pricing-catalog.usecase.ts';

export type PricingModuleDeps = Readonly<{ db: Database }>;

export const makePricingModule = ({ db }: PricingModuleDeps) => {
  const effectivePricingCatalogFinder =
    makePostgresEffectivePricingCatalogFinder(db);
  const loadPricingCatalog = makeLoadPricingCatalog(
    effectivePricingCatalogFinder,
  );
  const routes = makeLoadPricingCatalogRoutes({ loadPricingCatalog });

  return { routes };
};
