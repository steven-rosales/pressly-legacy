import { Router } from 'express';
import {
  loadPricingCatalogBoundary,
  makeLoadPricingCatalogController,
} from './load-pricing-catalog.controller.ts';
import type { LoadPricingCatalog } from './load-pricing-catalog.usecase.ts';

export const makeLoadPricingCatalogRoute = (input: {
  loadPricingCatalog: LoadPricingCatalog;
}): Router => {
  const router = Router();

  router.get(
    '/services/:serviceSlug/pricing',
    loadPricingCatalogBoundary.validate,
    makeLoadPricingCatalogController(input.loadPricingCatalog),
  );

  return router;
};
