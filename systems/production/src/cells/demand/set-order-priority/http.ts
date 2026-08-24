import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  productionOrderParamsSchema,
  setProductionOrderPriorityRequestSchema,
} from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import { setOrderPriorityContract } from './contract.ts';
import type {
  SetOrderPriorityExpectedFailure,
  SetOrderPriorityResult,
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
  // defineValidatedController validates body, query, then params. Preserve
  // that deployed precedence before after-input authorization.
  const body = setProductionOrderPriorityRequestSchema.safeParse(request.body);
  if (!body.success) invalidRequest('body', body.error.issues);

  const params = productionOrderParamsSchema.safeParse({
    locationId: request.params['locationId'],
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

const presentSetOrderPriority = (
  outcome: CellOutcome<SetOrderPriorityResult, SetOrderPriorityExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: setOrderPriorityContract.output.encode(outcome.value),
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

export const setOrderPriorityHttpSurfaces = Object.freeze([
  http.patch<SetOrderPriorityResult, SetOrderPriorityExpectedFailure>({
    path: '/production/locations/:locationId/orders/:productionOrderId/priority',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionOrderParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionOrderId: params['productionOrderId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present: presentSetOrderPriority,
  }),
]) satisfies readonly HttpSurface<
  SetOrderPriorityResult,
  SetOrderPriorityExpectedFailure
>[];
