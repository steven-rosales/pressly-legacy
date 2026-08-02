import type { RequestHandler } from 'express';
import { result } from '@pressly/kernel';
import { apiSuccess } from '@pressly/http';
import type { PricingParamsRequestSchema } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { LoadPricingCatalog } from './load-pricing-catalog.usecase.ts';

export const makeLoadPricingCatalogController = (
  loadPricingCatalog: LoadPricingCatalog,
): RequestHandler =>
  catchAsync(async (req, res) => {
    const params = req.params as PricingParamsRequestSchema;
    const command = { serviceSlug: params.serviceSlug };

    const catalogResult = await loadPricingCatalog(command);

    if (result.isErr(catalogResult)) throw catalogResult.error;

    res.status(200).json(apiSuccess(catalogResult.value));
  });
