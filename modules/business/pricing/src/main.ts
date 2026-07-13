import type { Database } from '@pressly/db';
import {
  Router,
  type RequestHandler,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import { makeLoadPricingCatalogRoute } from './load-pricing-catalog/load-pricing-catalog.route.ts';
import { makePublishPricingChangeRoute } from './publish-pricing/publish-pricing-change.route.ts';
import { makeEffectivePricingCatalogFinder } from './load-pricing-catalog/effective-pricing-catalog.repo.ts';
import { makePricingChangeStore } from './publish-pricing/pricing-change.repo.ts';
import { makeLoadPricingCatalog } from './load-pricing-catalog/load-pricing-catalog.usecase.ts';
import {
  makePlanPricingChange,
  type PlanPricingChange,
} from './publish-pricing/plan-pricing-change.usecase.ts';
import { makePublishPricingChange } from './publish-pricing/publish-pricing-change.usecase.ts';

export type ReadPricingChangeAuthor = (
  res: Response,
) => Parameters<PlanPricingChange>[0]['requestedBy'];

export type PricingRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export type PricingModuleDeps = Readonly<{
  db: Database;
  auth: PricingRouteSecurity;
}>;

export type PricingModule = Readonly<{
  routes: ExpressRouter;
}>;

export const makePricingModule = (deps: PricingModuleDeps): PricingModule => {
  const effectivePricingCatalogFinder = makeEffectivePricingCatalogFinder(
    deps.db,
  );
  const loadPricingCatalog = makeLoadPricingCatalog(
    effectivePricingCatalogFinder,
  );
  const pricingChangeStore = makePricingChangeStore({ db: deps.db });
  const planPricingChange = makePlanPricingChange(pricingChangeStore);
  const publishPricingChange = makePublishPricingChange(pricingChangeStore);
  const routes = Router();

  routes.use('/', makeLoadPricingCatalogRoute({ loadPricingCatalog }));

  routes.use(
    '/',
    makePublishPricingChangeRoute({
      planPricingChange,
      publishPricingChange,
      auth: deps.auth,
    }),
  );

  return { routes };
};
