import {
  previewProductionOrderRouteRequestSchema,
  productionOrderRoutingParamsSchema,
} from '../../../read-models/production-order-control/contract.ts';
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
import type { ProductionOrderRouteProposal } from '../../../model/order-route-proposal/model.ts';
import { previewOrderRouteContract } from './contract.ts';
import type { PreviewOrderRouteExpectedFailure } from './types.ts';

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
  // The deployed controller validates body before params, and authorization
  // only runs after both have succeeded.
  const body = previewProductionOrderRouteRequestSchema.safeParse(request.body);
  if (!body.success) invalidRequest('body', body.error.issues);

  const params = productionOrderRoutingParamsSchema.safeParse({
    locationId: request.params['locationId'],
    productionRunId: request.params['productionRunId'],
    productionOrderId: request.params['productionOrderId'],
  });
  if (!params.success) invalidRequest('params', params.error.issues);

  return { body: body.data, params: params.data };
};

const serializedInput = (request: HttpRequest): unknown => {
  const validated = validatedRequest(request);
  return {
    params: validated.params,
    body: validated.body,
    actorId: actorIdFromContext(request.context),
  };
};

const present = (
  outcome: CellOutcome<
    ProductionOrderRouteProposal,
    PreviewOrderRouteExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: previewOrderRouteContract.output.encode(outcome.value),
      },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  if (outcome.failure.kind === 'not_found') throw notFoundError(fields);
  if (outcome.failure.kind === 'conflict') throw conflictError(fields);
  throw validationError({ ...fields, status: 422 });
};

export const previewOrderRouteHttpSurfaces = Object.freeze([
  http.post<ProductionOrderRouteProposal, PreviewOrderRouteExpectedFailure>({
    path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionOrderRoutingParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionRunId: params['productionRunId'],
        productionOrderId: params['productionOrderId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  ProductionOrderRouteProposal,
  PreviewOrderRouteExpectedFailure
>[];
