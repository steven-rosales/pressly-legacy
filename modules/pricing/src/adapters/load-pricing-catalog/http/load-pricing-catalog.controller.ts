import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiFailure, apiSuccess } from '@pressly/http';
import type { PricingParamsRequestSchema } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { LoadPricingCatalog } from '../../../features/load-pricing-catalog/load-pricing-catalog.usecase.ts';

export const makeLoadPricingCatalogController = (
  loadPricingCatalog: LoadPricingCatalog,
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

    const catalogResult = await loadPricingCatalog(command);

    if (result.isErr(catalogResult)) {
      res
        .status(catalogResult.error.status)
        .json(apiFailure(catalogResult.error));
      return;
    }

    res.status(200).json(apiSuccess(catalogResult.value));
  });
