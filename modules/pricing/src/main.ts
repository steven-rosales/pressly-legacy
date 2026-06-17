import type { Database } from '@pressly/db';
import type { PricingChangeAuthor } from '@pressly/contracts';
import {
  Router,
  type RequestHandler,
  type Response,
  type Router as ExpressRouter,
} from 'express';
import { makeLoadPricingCatalogRoute } from './adapters/load-pricing-catalog/http/load-pricing-catalog.route.ts';
import { makePublishPricingChangeRoute } from './adapters/publish-pricing/http/publish-pricing-change.route.ts';
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

export type PricingModuleAction = 'pricing:plan' | 'pricing:publish';

export type PricingModuleRole = 'owner' | 'admin';

export type PricingModuleAuthorizationInput = Readonly<{
  action: PricingModuleAction;
  roles: readonly PricingModuleRole[];
  freshSessionMaxAgeMinutes?: number;
}>;

export type ReadPricingChangeAuthor = (res: Response) => PricingChangeAuthor;

export type PricingModuleAuth = Readonly<{
  authenticate: RequestHandler;
  authorize: (input: PricingModuleAuthorizationInput) => RequestHandler;
  readAuthor: ReadPricingChangeAuthor;
  freshSessionMaxAgeMinutes: number;
}>;

export type PricingModuleDeps = Readonly<{
  db: Database;
  auth: PricingModuleAuth;
}>;

export type PricingModuleActions = Readonly<{
  loadCatalog: LoadPricingCatalog;
  planChange: PlanPricingChange;
  publishChange: PublishPricingChange;
}>;

export type PricingModule = Readonly<{
  routes: ExpressRouter;
  actions: PricingModuleActions;
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
  const actions: PricingModuleActions = {
    loadCatalog: loadPricingCatalog,
    planChange: planPricingChange,
    publishChange: publishPricingChange,
  };
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

  return {
    actions,
    routes,
  };
};
