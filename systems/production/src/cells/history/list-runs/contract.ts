import {
  listProductionHistoryRunsQuerySchema,
  listProductionHistoryRunsResultSchema,
  productionHistoryLocationParamsSchema,
  type ListProductionHistoryRunsResult,
} from '../../../read-models/production-history/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  listHistoryRunsCursorInvalid,
  listHistoryRunsLocationNotFound,
} from './failures.ts';
import type {
  ListHistoryRunsExpectedFailure,
  ListHistoryRunsInput,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const issues = (
  prefix: 'output' | 'params' | 'query',
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<ListHistoryRunsInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The list-history-runs input must be an object.' },
    ]);
  const params = productionHistoryLocationParamsSchema.safeParse(
    serialized['params'],
  );
  const query = listProductionHistoryRunsQuerySchema.safeParse(
    serialized['query'],
  );
  const failures = [
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(query.success ? [] : issues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(failures);

  return decode.valid({
    locationId: params.data.locationId,
    limit: query.data.limit,
    ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
    ...(query.data.search === undefined ? {} : { search: query.data.search }),
    ...(query.data.status === undefined ? {} : { status: query.data.status }),
    ...(query.data.createdAfter === undefined
      ? {}
      : { createdAfter: new Date(query.data.createdAfter) }),
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ListProductionHistoryRunsResult> => {
  const parsed = listProductionHistoryRunsResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ListProductionHistoryRunsResult): unknown => {
  const parsed = listProductionHistoryRunsResultSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_api_success_response',
      message:
        'An application success result did not satisfy its serialized response contract.',
      safeMessage: 'The request could not be completed.',
      cause: parsed.error,
    });
  return parsed.data;
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ListHistoryRunsExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The list-history-runs failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(listHistoryRunsLocationNotFound());
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_history_cursor_invalid'
  )
    return decode.valid(listHistoryRunsCursorInvalid());
  return decode.invalid([
    { path: [], message: 'The list-history-runs failure is invalid.' },
  ]);
};

export const listHistoryRunsContract = defineCellContract<
  ListHistoryRunsInput,
  ListProductionHistoryRunsResult,
  ListHistoryRunsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      query: {
        limit: input.limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.search === undefined ? {} : { search: input.search }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.createdAfter === undefined
          ? {}
          : { createdAfter: input.createdAfter.toISOString() }),
      },
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
