import { Router } from 'express';
import { pricingParamsRequestSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { LoadPricingCatalog } from '../../../features/load-pricing-catalog/load-pricing-catalog.usecase.ts';
import { makeLoadPricingCatalogController } from './load-pricing-catalog.controller.ts';

export const makeLoadPricingCatalogRoute = (input: {
  loadPricingCatalog: LoadPricingCatalog;
}): Router => {
  const router = Router();
  const validate = validateRequest({ params: pricingParamsRequestSchema });
  const controller = makeLoadPricingCatalogController(input.loadPricingCatalog);

  router.get('/services/:serviceSlug/pricing', validate, controller);

  router.get(
    '/locations/:locationSlug/services/:serviceSlug/pricing',
    validate,
    controller,
  );

  return router;
};
