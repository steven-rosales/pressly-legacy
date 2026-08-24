import { placeProductionOrderExactlyRequestSchema } from '../../../read-models/production-order-placement/contract.ts';
import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import {
  placeOrderExactlyContract,
  placeOrderExactlyParamsSchema,
} from './contract.ts';
import type {
  PlaceOrderExactlyExpectedFailure,
  PlaceOrderExactlyResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const actorIdFromContext = (context: unknown): string => {
  const actorId = isRecord(context) ? context['actorId'] : undefined;
  if (typeof actorId === 'string' && actorId.length > 0) return actorId;
  throw authError({
    code: 'missing_auth_principal',
    message: 'Authenticated principal is missing from request context.',
    safeMessage: 'Authentication is required.',
  });
};

const invalidRequest = (
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
  const body = placeProductionOrderExactlyRequestSchema.safeParse(request.body);
  if (!body.success) invalidRequest('body', body.error.issues);
  const params = placeOrderExactlyParamsSchema.safeParse({
    locationId: request.params['locationId'],
    productionRunId: request.params['productionRunId'],
    productionBatchId: request.params['productionBatchId'],
    productionOrderId: request.params['productionOrderId'],
  });
  if (!params.success) invalidRequest('params', params.error.issues);
  return { body: body.data, params: params.data };
};

const serializedInput = (request: HttpRequest): unknown => {
  const validated = validatedRequest(request);
  return {
    body: validated.body,
    params: validated.params,
    actorId: actorIdFromContext(request.context),
  };
};

const present = (
  outcome: CellOutcome<
    PlaceOrderExactlyResult,
    PlaceOrderExactlyExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: placeOrderExactlyContract.output.encode(outcome.value),
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

export const placeOrderExactlyHttpSurfaces = Object.freeze([
  http.post<PlaceOrderExactlyResult, PlaceOrderExactlyExpectedFailure>({
    path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: placeOrderExactlyParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionRunId: params['productionRunId'],
        productionBatchId: params['productionBatchId'],
        productionOrderId: params['productionOrderId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  PlaceOrderExactlyResult,
  PlaceOrderExactlyExpectedFailure
>[];
