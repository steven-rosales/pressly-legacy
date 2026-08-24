import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
} from './boundary.ts';
import {
  authError,
  conflictError,
  validationError,
} from '@pressly/errors/factories';
import { createShiftContract } from './contract.ts';
import type { CreateShiftExpectedFailure, ProductionShift } from './types.ts';

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
  const body = createProductionShiftRequestSchema.safeParse(request.body);
  if (!body.success) invalidRequest('body', body.error.issues);

  const params = productionLocationParamsSchema.safeParse({
    locationId: request.params['locationId'],
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
  outcome: CellOutcome<ProductionShift, CreateShiftExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 201,
      body: {
        ok: true,
        data: createShiftContract.output.encode(outcome.value),
      },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  if (outcome.failure.kind === 'conflict') throw conflictError(fields);
  throw validationError({ ...fields, status: 400 });
};

export const createShiftHttpSurfaces = Object.freeze([
  http.post<ProductionShift, CreateShiftExpectedFailure>({
    path: '/production/locations/:locationId/shifts',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionLocationParamsSchema,
      input: (params) => ({ locationId: params['locationId'] }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  ProductionShift,
  CreateShiftExpectedFailure
>[];
