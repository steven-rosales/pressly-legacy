import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  assignStageMachinesRequestSchema,
  productionStageParamsSchema,
} from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import { assignStageMachinesContract } from './contract.ts';
import type {
  AssignStageMachinesExpectedFailure,
  AssignStageMachinesResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const actorId = (context: unknown): string => {
  const value = isRecord(context) ? context['actorId'] : undefined;
  if (typeof value === 'string' && value.length > 0) return value;
  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request context.',
    safeMessage: 'Authentication is required.',
  });
};

const invalid = (
  location: 'body' | 'params',
  issues: readonly Readonly<{
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
      issues: issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  });
};

const validatedRequest = (request: HttpRequestInput) => {
  const body = assignStageMachinesRequestSchema.safeParse(request.body);
  if (!body.success) invalid('body', body.error.issues);
  const params = productionStageParamsSchema.safeParse({
    locationId: request.params['locationId'],
    stageRunId: request.params['stageRunId'],
  });
  if (!params.success) invalid('params', params.error.issues);
  return { body: body.data, params: params.data };
};

const serializedInput = (request: HttpRequest): unknown => {
  const validated = validatedRequest(request);
  return {
    params: validated.params,
    body: validated.body,
    actorId: actorId(request.context),
  };
};

const present = (
  outcome: CellOutcome<
    AssignStageMachinesResult,
    AssignStageMachinesExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: assignStageMachinesContract.output.encode(outcome.value),
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

export const assignStageMachinesHttpSurfaces = Object.freeze([
  http.put<AssignStageMachinesResult, AssignStageMachinesExpectedFailure>({
    path: '/production/locations/:locationId/stages/:stageRunId/machines',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionStageParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        stageRunId: params['stageRunId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  AssignStageMachinesResult,
  AssignStageMachinesExpectedFailure
>[];
