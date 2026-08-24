import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { notFoundError, validationError } from '@pressly/errors/factories';
import type { PricingCatalog } from '../../../model/pricing.ts';
import { loadPricingCatalogContract, pricingParamsSchema } from './contract.ts';
import type { LoadPricingCatalogExpectedFailure } from './types.ts';

const validatedParams = (request: HttpRequestInput) => {
  const parsed = pricingParamsSchema.safeParse({
    serviceSlug: request.params['serviceSlug'],
  });
  if (parsed.success) return parsed.data;
  throw validationError({
    code: 'invalid_params_type',
    message: 'Validation params failed.',
    safeMessage: 'Invalid request input.',
    publicDetails: {
      location: 'params',
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

const present = (
  outcome: CellOutcome<PricingCatalog, LoadPricingCatalogExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: loadPricingCatalogContract.output.encode(outcome.value),
      },
    };

  throw notFoundError({
    code: outcome.failure.code,
    message:
      outcome.failure.missing === 'service'
        ? `Pricing service not found: ${outcome.failure.serviceSlug}`
        : `Active pricing set not found: ${outcome.failure.serviceSlug}`,
    safeMessage: 'Pricing is not available.',
  });
};

export const loadPricingCatalogHttpSurfaces = Object.freeze([
  http.get<PricingCatalog, LoadPricingCatalogExpectedFailure>({
    path: '/pricing/services/:serviceSlug/pricing',
    invalidRequest: {
      input: {
        code: 'invalid_params_type',
        message: 'Validation params failed.',
        safeMessage: 'Invalid request input.',
        location: 'params',
      },
    },
    validateRequest: (request) => {
      validatedParams(request);
      return undefined;
    },
    toSerializedInput: (request: HttpRequest) => validatedParams(request),
    present,
  }),
]) satisfies readonly HttpSurface<
  PricingCatalog,
  LoadPricingCatalogExpectedFailure
>[];
