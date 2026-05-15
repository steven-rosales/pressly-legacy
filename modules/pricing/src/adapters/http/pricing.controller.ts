import type { RequestHandler } from 'express';
import { apiFailure, apiSuccess } from '@pressly/http';
import type { PricingParamsRequestSchema } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { GetPricing } from '../../features/get-pricing/get-pricing.usecase.ts';

export const makeGetPricingController = (
  getPricing: GetPricing,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const params = req.params as PricingParamsRequestSchema;
    const command =
      params.locationSlug === undefined
        ? { serviceSlug: params.serviceSlug }
        : {
            serviceSlug: params.serviceSlug,
            locationSlug: params.locationSlug,
          };

    const result = await getPricing(command);

    if (!result.ok) {
      res.status(result.error.status).json(apiFailure(result.error));
      return;
    }

    res.status(200).json(apiSuccess(result.value));
  });
