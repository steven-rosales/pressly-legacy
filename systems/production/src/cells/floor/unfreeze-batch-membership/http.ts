import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { unfreezeProductionBatchRequestSchema } from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import {
  unfreezeBatchMembershipContract,
  unfreezeBatchMembershipParamsSchema,
} from './contract.ts';
import type {
  UnfreezeBatchMembershipExpectedFailure,
  UnfreezeBatchMembershipResult,
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
const validatedRequest = (request: HttpRequestInput) => {
  const body = unfreezeProductionBatchRequestSchema.safeParse(request.body);
  if (!body.success) invalid('body', body.error.issues);
  const params = unfreezeBatchMembershipParamsSchema.safeParse({
    locationId: request.params['locationId'],
    productionRunId: request.params['productionRunId'],
    productionBatchId: request.params['productionBatchId'],
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
    UnfreezeBatchMembershipResult,
    UnfreezeBatchMembershipExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: unfreezeBatchMembershipContract.output.encode(outcome.value),
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

export const unfreezeBatchMembershipHttpSurfaces = Object.freeze([
  http.post<
    UnfreezeBatchMembershipResult,
    UnfreezeBatchMembershipExpectedFailure
  >({
    path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: unfreezeBatchMembershipParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionRunId: params['productionRunId'],
        productionBatchId: params['productionBatchId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  UnfreezeBatchMembershipResult,
  UnfreezeBatchMembershipExpectedFailure
>[];
