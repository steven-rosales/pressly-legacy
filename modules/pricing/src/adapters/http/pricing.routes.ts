import { Router } from 'express';
import { validateRequest } from '@pressly/http/express';
import { pricingParamsRequestSchema } from '@pressly/contracts';
import type { LoadPricingCatalog } from '../../features/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { makeLoadPricingCatalogController } from './pricing.controller.ts';

export const makePricingRoutes = (input: {
  loadPricingCatalog: LoadPricingCatalog;
}): Router => {
  const router = Router();
  const loadPricingCatalogController = makeLoadPricingCatalogController(
    input.loadPricingCatalog,
  );

  router.get(
    '/services/:serviceSlug/pricing',
    validateRequest({ params: pricingParamsRequestSchema }),
    loadPricingCatalogController,
  );
  router.get(
    '/locations/:locationSlug/services/:serviceSlug/pricing',
    validateRequest({ params: pricingParamsRequestSchema }),
    loadPricingCatalogController,
  );

  return router;
};
