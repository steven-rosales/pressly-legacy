import { Router } from 'express';
import { validateRequest } from '@pressly/express';
import { pricingParamsRequestSchema } from '@pressly/contracts';
import type { GetPricing } from '../../features/get-pricing/get-pricing.usecase.ts';
import { makeGetPricingController } from './pricing.controller.ts';

export const makePricingRoutes = (input: {
  getPricing: GetPricing;
}): Router => {
  const router = Router();
  const getPricingController = makeGetPricingController(input.getPricing);

  router.get(
    '/services/:serviceSlug/pricing',
    validateRequest({ params: pricingParamsRequestSchema }),
    getPricingController,
  );
  router.get(
    '/locations/:locationSlug/services/:serviceSlug/pricing',
    validateRequest({ params: pricingParamsRequestSchema }),
    getPricingController,
  );

  return router;
};
