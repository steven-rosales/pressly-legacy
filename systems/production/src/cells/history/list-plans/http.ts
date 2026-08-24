import {
  listProductionHistoryPlansQuerySchema,
  productionHistoryLocationParamsSchema,
  type ListProductionHistoryPlansResult,
} from '../../../read-models/production-history/contract.ts';
import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpRequestInput,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { notFoundError, validationError } from '@pressly/errors/factories';
import { listHistoryPlansContract } from './contract.ts';
import type { ListHistoryPlansExpectedFailure } from './types.ts';

type RequestLocation = 'params' | 'query';

const invalidRequest = (
  location: RequestLocation,
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
  // defineValidatedController validates body, query, then params. This GET has
  // no body, so query must win when both query and params are malformed.
  const query = listProductionHistoryPlansQuerySchema.safeParse(request.query);
  if (!query.success) invalidRequest('query', query.error.issues);

  const params = productionHistoryLocationParamsSchema.safeParse({
    locationId: request.params['locationId'],
  });
  if (!params.success) invalidRequest('params', params.error.issues);
  return { params: params.data, query: query.data };
};

const serializedInput = (request: HttpRequest): unknown =>
  validatedRequest(request);

const present = (
  outcome: CellOutcome<
    ListProductionHistoryPlansResult,
    ListHistoryPlansExpectedFailure
  >,
): HttpResponse => {
  if (outcome.kind === 'success')
    return {
      status: 200,
      body: {
        ok: true,
        data: listHistoryPlansContract.output.encode(outcome.value),
      },
    };

  const fields = {
    code: outcome.failure.code,
    message: outcome.failure.message,
    safeMessage: outcome.failure.safeMessage,
  };
  if (outcome.failure.kind === 'not_found') throw notFoundError(fields);
  throw validationError({ ...fields, status: 400 });
};

export const listHistoryPlansHttpSurfaces: readonly HttpSurface<
  ListProductionHistoryPlansResult,
  ListHistoryPlansExpectedFailure
>[] = Object.freeze([
  http.get({
    path: '/production/locations/:locationId/history/plans',
    validateRequest: (request) => {
      validatedRequest(request);
      return undefined;
    },
    decodeAuthorizationScope: http.validatedPathScope({
      schema: productionHistoryLocationParamsSchema,
      input: (params) => ({ locationId: params['locationId'] }),
      scope: (params) => params.locationId,
    }),
    toSerializedInput: serializedInput,
    present,
  }),
]);
