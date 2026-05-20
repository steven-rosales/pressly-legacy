import type { Database } from '@pressly/db';
import { makeLoadPricingCatalogRoutes } from './adapters/load-pricing-catalog/http/load-pricing-catalog.route.ts';
import { makeEffectivePricingCatalogFinder } from './adapters/load-pricing-catalog/persistence/effective-pricing-catalog.repo.ts';
import { makePricingChangeStore } from './adapters/publish-pricing/persistence/pricing-change.repo.ts';
import {
  makeLoadPricingCatalog,
  type LoadPricingCatalog,
} from './features/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import {
  makePlanPricingChange,
  type PlanPricingChange,
} from './features/publish-pricing/plan-pricing-change.usecase.ts';
import {
  makePublishPricingChange,
  type PublishPricingChange,
} from './features/publish-pricing/publish-pricing-change.usecase.ts';

export type PricingModuleDeps = Readonly<{ db: Database }>;

export type PricingModuleAdmin = Readonly<{
  loadCatalog: LoadPricingCatalog;
  planChange: PlanPricingChange;
  publishChange: PublishPricingChange;
}>;

export const makePricingModule = ({ db }: PricingModuleDeps) => {
  const effectivePricingCatalogFinder = makeEffectivePricingCatalogFinder(db);
  const loadPricingCatalog = makeLoadPricingCatalog(
    effectivePricingCatalogFinder,
  );
  const pricingChangeStore = makePricingChangeStore({ db });
  const planPricingChange = makePlanPricingChange(pricingChangeStore);
  const publishPricingChange = makePublishPricingChange(pricingChangeStore);
  const routes = makeLoadPricingCatalogRoutes({ loadPricingCatalog });

  return {
    routes,
    admin: {
      loadCatalog: loadPricingCatalog,
      planChange: planPricingChange,
      publishChange: publishPricingChange,
    },
  };
};

export type PricingModule = ReturnType<typeof makePricingModule>;
