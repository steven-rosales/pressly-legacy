import {
  listProductionLocationsQuerySchema,
  type ListProductionLocationsResult,
} from './boundary.ts';
import {
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { authError, validationError } from '@pressly/errors/factories';
import { listLocationsContract } from './contract.ts';
import type { ListLocationsExpectedFailure } from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Resolved by the authenticated HTTP host before this selected cell runs. */
export type ListLocationsHttpContext = Readonly<{
  allowedLocationIds: readonly string[] | null;
}>;

const readAllowedLocationIds = (context: unknown): readonly string[] | null => {
  if (!isRecord(context) || !('allowedLocationIds' in context))
    throw authError({
      code: 'production_location_scope_missing',
      message: 'Authenticated location scope is missing from request context.',
      safeMessage: 'Authentication is required.',
    });

  const value = context['allowedLocationIds'];
  if (
    value === null ||
    (Array.isArray(value) &&
      value.every((entry) => typeof entry === 'string' && entry.length > 0))
  )
    return value as readonly string[] | null;

  throw authError({
    code: 'production_location_scope_invalid',
    message: 'Authenticated location scope is invalid.',
    safeMessage: 'Authentication is required.',
  });
};

const validatedQuery = (queryInput: unknown) => {
  const query = listProductionLocationsQuerySchema.safeParse(queryInput);
  if (!query.success)
    throw validationError({
      code: 'invalid_query_type',
      message: 'Validation query failed.',
      safeMessage: 'Invalid request input.',
      publicDetails: {
        location: 'query',
        issues: query.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      },
    });

  return query.data;
};

const serializedInput = (request: HttpRequest): unknown => ({
  query: validatedQuery(request.query),
  allowedLocationIds: readAllowedLocationIds(request.context),
});

const present = (
  outcome: CellOutcome<
    ListProductionLocationsResult,
    ListLocationsExpectedFailure
  >,
): HttpResponse =>
  outcome.kind === 'success'
    ? {
        status: 200,
        body: {
          ok: true,
          data: listLocationsContract.output.encode(outcome.value),
        },
      }
    : outcome.failure;

export const listLocationsHttpSurfaces: readonly HttpSurface<
  ListProductionLocationsResult,
  ListLocationsExpectedFailure
>[] = Object.freeze([
  http.get({
    path: '/production/locations',
    contextRequirements: ['allowed-production-location-ids'],
    validateRequest: (request) => {
      validatedQuery(request.query);
      return undefined;
    },
    toSerializedInput: serializedInput,
    present,
  }),
]);
