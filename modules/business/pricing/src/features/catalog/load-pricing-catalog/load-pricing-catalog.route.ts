import { Router } from 'express';
import { makeLoadPricingCatalogController } from './load-pricing-catalog.controller.ts';
import type { LoadPricingCatalog } from './load-pricing-catalog.usecase.ts';

export const makeLoadPricingCatalogRoute = (input: {
  loadPricingCatalog: LoadPricingCatalog;
}): Router => {
  const router = Router();
  const controller = makeLoadPricingCatalogController(input.loadPricingCatalog);

  router.get(
    '/services/:serviceSlug/pricing',
    controller.validate,
    controller.handle,
  );

  return router;
};
