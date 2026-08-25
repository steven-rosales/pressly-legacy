import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  productionShiftParamsSchema,
  updateProductionShiftRequestSchema,
} from './boundary.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import { updateShiftContract } from './contract.ts';
import type { UpdateShiftExpectedFailure, UpdateShiftResult } from './types.ts';

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
  const body = updateProductionShiftRequestSchema.safeParse(request.body);
  if (!body.success) invalidRequest('body', body.error.issues);

  const params = productionShiftParamsSchema.safeParse({
    locationId: request.params['locationId'],
    productionShiftId: request.params['productionShiftId'],
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
  outcome: CellOutcome<UpdateShiftResult, UpdateShiftExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: updateShiftContract.output.encode(outcome.value),
      },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  if (outcome.failure.kind === 'validation')
    throw validationError({ ...fields, status: 422 });
  if (outcome.failure.kind === 'not_found') throw notFoundError(fields);
  throw conflictError(fields);
};

export const updateShiftHttpSurfaces = Object.freeze([
  http.patch<UpdateShiftResult, UpdateShiftExpectedFailure>({
    path: '/production/locations/:locationId/shifts/:productionShiftId',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionShiftParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionShiftId: params['productionShiftId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  UpdateShiftResult,
  UpdateShiftExpectedFailure
>[];
