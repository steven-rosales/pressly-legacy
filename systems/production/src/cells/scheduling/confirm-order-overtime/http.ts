import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { confirmProductionOrderOvertimeRequestSchema } from '../../../read-models/production-order-placement/contract.ts';
import {
  authError,
  conflictError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import {
  confirmOrderOvertimeContract,
  confirmOrderOvertimeParamsSchema,
} from './contract.ts';
import type {
  ConfirmOrderOvertimeExpectedFailure,
  ConfirmProductionOrderOvertimeResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
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
  const body = confirmProductionOrderOvertimeRequestSchema.safeParse(
    request.body,
  );
  if (!body.success) invalid('body', body.error.issues);
  const params = confirmOrderOvertimeParamsSchema.safeParse({
    locationId: request.params['locationId'],
    productionRunId: request.params['productionRunId'],
    productionOrderId: request.params['productionOrderId'],
  });
  if (!params.success) invalid('params', params.error.issues);
  return { body: body.data, params: params.data };
};
const toSerializedInput = (request: HttpRequest): unknown => {
  const validated = validatedRequest(request);
  return {
    params: validated.params,
    body: validated.body,
    actorId: actorId(request.context),
  };
};
const present = (
  outcome: CellOutcome<
    ConfirmProductionOrderOvertimeResult,
    ConfirmOrderOvertimeExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: confirmOrderOvertimeContract.output.encode(outcome.value),
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

export const confirmOrderOvertimeHttpSurfaces = Object.freeze([
  http.post<
    ConfirmProductionOrderOvertimeResult,
    ConfirmOrderOvertimeExpectedFailure
  >({
    path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    bodyLimit: '64kb',
    contextRequirements: ['authenticated-actor'],
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: confirmOrderOvertimeParamsSchema,
      input: (params) => ({
        locationId: params['locationId'],
        productionRunId: params['productionRunId'],
        productionOrderId: params['productionOrderId'],
      }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput,
    present,
  }),
]) satisfies readonly HttpSurface<
  ConfirmProductionOrderOvertimeResult,
  ConfirmOrderOvertimeExpectedFailure
>[];
