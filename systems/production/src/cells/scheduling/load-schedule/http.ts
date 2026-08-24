import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { productionScheduleParamsSchema } from './boundary.ts';
import { type ScheduleProposal } from '../../../read-models/production-schedule/contract.ts';
import { notFoundError, validationError } from '@pressly/errors/factories';
import { loadScheduleContract } from './contract.ts';
import type { LoadScheduleExpectedFailure } from './types.ts';

const invalidParams = (
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): never => {
  throw validationError({
    code: 'invalid_params_type',
    message: 'Validation params failed.',
    safeMessage: 'Invalid request input.',
    publicDetails: {
      location: 'params',
      issues: issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

const validatedParams = (request: HttpRequestInput) => {
  const params = productionScheduleParamsSchema.safeParse({
    locationId: request.params['locationId'],
    scheduleRunId: request.params['scheduleRunId'],
  });
  if (!params.success) invalidParams(params.error.issues);
  return params.data;
};

const serializedInput = (request: HttpRequest): unknown => ({
  params: validatedParams(request),
});

const present = (
  outcome: CellOutcome<ScheduleProposal, LoadScheduleExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: loadScheduleContract.output.encode(outcome.value),
      },
    };

  throw notFoundError({
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  });
};

export const loadScheduleHttpSurfaces: readonly HttpSurface<
  ScheduleProposal,
  LoadScheduleExpectedFailure
>[] = Object.freeze([
  http.get({
    path: '/production/locations/:locationId/schedules/:scheduleRunId',
    invalidRequest: {
      input: {
        code: 'invalid_params_type',
        message: 'Validation params failed.',
        safeMessage: 'Invalid request input.',
        status: 400,
        location: 'params',
      },
    },
    validateRequest: (request) => {
      validatedParams(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionScheduleParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        scheduleRunId: params['scheduleRunId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]);
