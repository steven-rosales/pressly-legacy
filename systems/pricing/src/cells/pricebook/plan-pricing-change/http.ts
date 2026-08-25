import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { conflictError, notFoundError } from '@pressly/errors/factories';
import {
  pricingChangeFailureAppErrorFields,
  pricingChangePolicyAppError,
} from '../../../http/pricing-change-failure.ts';
import {
  serializedPricingChangeInput,
  validatedPricingChangeBody,
} from '../../../http/pricing-change-request.ts';
import type { PricingChangePlan } from '../../../model/pricing-change.ts';
import { planPricingChangeContract } from './contract.ts';
import type { PlanPricingChangeExpectedFailure } from './types.ts';

const present = (
  outcome: CellOutcome<PricingChangePlan, PlanPricingChangeExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: planPricingChangeContract.output.encode(outcome.value),
      },
    };

  const failure = outcome.failure;
  if ('violations' in failure) throw pricingChangePolicyAppError(failure);
  const fields = pricingChangeFailureAppErrorFields(failure);
  if (failure.code === 'multiple_active_pricing_sets')
    throw conflictError(fields);
  throw notFoundError(fields);
};

export const planPricingChangeHttpSurfaces = Object.freeze([
  http.post<PricingChangePlan, PlanPricingChangeExpectedFailure>({
    path: '/pricing/changes/plan',
    bodyLimit: '16kb',
    contextRequirements: ['pricing-change-author'],
    invalidRequest: {
      input: {
        code: 'invalid_body_type',
        message: 'Validation body failed.',
        safeMessage: 'Invalid request input.',
        location: 'body',
      },
    },
    validateRequest: (request) => {
      validatedPricingChangeBody(request);
      return undefined;
    },
    toSerializedInput: (request: HttpRequest) =>
      serializedPricingChangeInput(request),
    present,
  }),
]) satisfies readonly HttpSurface<
  PricingChangePlan,
  PlanPricingChangeExpectedFailure
>[];
