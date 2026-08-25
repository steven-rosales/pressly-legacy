import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  createScheduleRequestSchema,
  productionLocationParamsSchema,
} from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import { createScheduleContract } from './contract.ts';
import type { CreateScheduleExpectedFailure } from './types.ts';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const actor = (context: unknown): string => {
  const id = record(context) ? context['actorId'] : undefined;
  if (typeof id === 'string' && id.length > 0) return id;
  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request context.',
    safeMessage: 'Authentication is required.',
  });
};
const invalid = (
  location: 'body' | 'params',
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): never => {
  throw validationError({
    code: `invalid_${location}_type`,
    message: `Validation ${location} failed.`,
    safeMessage: 'Invalid request input.',
    publicDetails: {
      location,
      issues: values.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};
const validate = (request: HttpRequestInput) => {
  const body = createScheduleRequestSchema.safeParse(request.body);
  if (!body.success) invalid('body', body.error.issues);
  const params = productionLocationParamsSchema.safeParse({
    locationId: request.params['locationId'],
  });
  if (!params.success) invalid('params', params.error.issues);
  return { body: body.data, params: params.data };
};
const serialized = (request: HttpRequest): unknown => {
  const value = validate(request);
  return {
    params: value.params,
    body: value.body,
    actorId: actor(request.context),
  };
};
const present = (
  outcome: CellOutcome<ScheduleProposal, CreateScheduleExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 201,
      body: {
        ok: true,
        data: createScheduleContract.output.encode(outcome.value),
      },
    };
  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  throw outcome.failure.kind === 'not_found'
    ? notFoundError(fields)
    : conflictError(fields);
};
export const createScheduleHttpSurfaces = Object.freeze([
  http.post<ScheduleProposal, CreateScheduleExpectedFailure>({
    path: '/production/locations/:locationId/schedules',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validate(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionLocationParamsSchema,
      input: (params) => ({ locationId: params['locationId'] }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serialized,
    present,
  }),
]) satisfies readonly HttpSurface<
  ScheduleProposal,
  CreateScheduleExpectedFailure
>[];
