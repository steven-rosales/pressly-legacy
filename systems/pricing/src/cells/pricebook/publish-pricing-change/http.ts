import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  pricingChangeFailureAppErrorFields,
  pricingChangePolicyAppError,
  pricingStateChangedAppError,
} from '../../../http/pricing-change-failure.ts';
import {
  serializedPricingChangeInput,
  validatedPricingChangeBody,
} from '../../../http/pricing-change-request.ts';
import type { PublishedPricingChange } from '../../../model/pricing-change.ts';
import { publishPricingChangeContract } from './contract.ts';
import type { PublishPricingChangeExpectedFailure } from './types.ts';
import { conflictError, notFoundError } from '@pressly/errors/factories';

const present = (
  outcome: CellOutcome<
    PublishedPricingChange,
    PublishPricingChangeExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: publishPricingChangeContract.output.encode(outcome.value),
      },
    };

  const failure = outcome.failure;
  if ('violations' in failure) throw pricingChangePolicyAppError(failure);
  if (failure.code === 'pricing_state_changed')
    throw pricingStateChangedAppError(failure);
  const fields = pricingChangeFailureAppErrorFields(failure);
  if (failure.code === 'multiple_active_pricing_sets')
    throw conflictError(fields);
  throw notFoundError(fields);
};

export const publishPricingChangeHttpSurfaces = Object.freeze([
  http.post<PublishedPricingChange, PublishPricingChangeExpectedFailure>({
    path: '/pricing/changes/publish',
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
  PublishedPricingChange,
  PublishPricingChangeExpectedFailure
>[];
