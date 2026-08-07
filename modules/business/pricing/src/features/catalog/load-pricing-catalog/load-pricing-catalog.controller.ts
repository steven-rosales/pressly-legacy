import { type AppError } from '@pressly/errors/app-error';
import { notFoundError } from '@pressly/errors/factories';
import {
  defineValidatedController,
  sendValidatedApiResult,
} from '@pressly/http/express';
import { result } from '@pressly/kernel';
import type { LoadPricingCatalogFailure } from './load-pricing-catalog.failure.ts';
import {
  loadPricingCatalogContract,
  toLoadPricingCatalogCommand,
  toPricingCatalogResult,
} from './load-pricing-catalog.contract.mapper.ts';
import type { LoadPricingCatalog } from './load-pricing-catalog.usecase.ts';

const toAppError = (failure: LoadPricingCatalogFailure): AppError =>
  notFoundError({
    code: failure.code,
    message:
      failure.missing === 'service'
        ? `Pricing service not found: ${failure.serviceSlug}`
        : `Active pricing set not found: ${failure.serviceSlug}`,
    safeMessage: 'Pricing is not available.',
  });

export const makeLoadPricingCatalogController = (
  loadPricingCatalog: LoadPricingCatalog,
) =>
  defineValidatedController({
    request: { params: loadPricingCatalogContract.params },
    handle: async ({ params }, { response }) => {
      const catalog = await loadPricingCatalog(
        toLoadPricingCatalogCommand(params),
      );

      sendValidatedApiResult(response, result.mapError(toAppError)(catalog), {
        schema: loadPricingCatalogContract.response,
        present: toPricingCatalogResult,
      });
    },
  });
