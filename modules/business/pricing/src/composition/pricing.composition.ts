import type { Database } from '@pressly/db/client';
import type { Clock } from '@pressly/time';
import {
  Router,
  type RequestHandler,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import { makeLoadPricingCatalogRoute } from '../features/catalog/load-pricing-catalog/load-pricing-catalog.route.ts';
import { makeLoadPricingCatalog } from '../features/catalog/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { makeEffectivePricingCatalogFinder } from '../features/catalog/load-pricing-catalog/effective-pricing-catalog.repo.ts';
import { makePlanPricingChangeRoute } from '../features/pricebook/plan-pricing-change/plan-pricing-change.route.ts';
import {
  makePlanPricingChange,
  type PlanPricingChange,
} from '../features/pricebook/plan-pricing-change/plan-pricing-change.usecase.ts';
import { makePublishPricingChangeRoute } from '../features/pricebook/publish-pricing-change/publish-pricing-change.route.ts';
import { makePublishPricingChange } from '../features/pricebook/publish-pricing-change/publish-pricing-change.usecase.ts';
import { makePostgresPricingChangeStore } from '../foundations/adapters/postgres/pricing-change-store/pricing-change-store.repo.ts';

export type ReadPricingChangeAuthor = (
  response: Response,
) => Parameters<PlanPricingChange>[0]['requestedBy'];

export type PricingRouteSecurity = Readonly<{
  authenticate: RequestHandler;
  planPricingChange: RequestHandler;
  publishPricingChange: RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
}>;

export type PricingModuleDeps = Readonly<{
  db: Database;
  clock: Clock;
  auth: PricingRouteSecurity;
}>;

export type PricingModule = Readonly<{
  routes: ExpressRouter;
}>;

export const makePricingModule = (deps: PricingModuleDeps): PricingModule => {
  const routes = Router();

  const pricingChangeStore = makePostgresPricingChangeStore({ db: deps.db });

  const loadPricingCatalog = makeLoadPricingCatalog(
    makeEffectivePricingCatalogFinder(deps.db),
  );

  routes.use('/', makeLoadPricingCatalogRoute({ loadPricingCatalog }));

  routes.use(
    '/',
    makePlanPricingChangeRoute({
      planPricingChange: makePlanPricingChange(pricingChangeStore),
      security: {
        authenticate: deps.auth.authenticate,
        authorize: deps.auth.planPricingChange,
        readAuthor: deps.auth.readAuthor,
      },
    }),
  );

  routes.use(
    '/',
    makePublishPricingChangeRoute({
      publishPricingChange: makePublishPricingChange(
        pricingChangeStore,
        deps.clock,
      ),
      security: {
        authenticate: deps.auth.authenticate,
        authorize: deps.auth.publishPricingChange,
        readAuthor: deps.auth.readAuthor,
      },
    }),
  );

  return { routes };
};
