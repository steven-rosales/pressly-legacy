import {
  listProductionHistoryPlansQuerySchema,
  listProductionHistoryPlansResultSchema,
  productionHistoryLocationParamsSchema,
  type ListProductionHistoryPlansResult,
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
  listHistoryPlansCursorInvalid,
  listHistoryPlansLocationNotFound,
} from './failures.ts';
import type {
  ListHistoryPlansExpectedFailure,
  ListHistoryPlansInput,
} from './types.ts';

type SerializedListHistoryPlansInput = Readonly<{
  params: unknown;
  query: unknown;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const prefixedIssues = (
  prefix: 'output' | 'params' | 'query',
  issues: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  issues.map((issue) => ({
    path: [
      prefix,
      ...issue.path.map((segment) =>
        typeof segment === 'string' || typeof segment === 'number'
          ? segment
          : String(segment),
      ),
    ],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<ListHistoryPlansInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The list-history-plans input must be an object.',
      },
    ]);

  const params = productionHistoryLocationParamsSchema.safeParse(
    serialized['params'],
  );
  const query = listProductionHistoryPlansQuerySchema.safeParse(
    serialized['query'],
  );
  const issues = [
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(query.success ? [] : prefixedIssues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    limit: query.data.limit,
    ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
    ...(query.data.runId === undefined ? {} : { runId: query.data.runId }),
    ...(query.data.search === undefined ? {} : { search: query.data.search }),
    ...(query.data.status === undefined ? {} : { status: query.data.status }),
    ...(query.data.createdAfter === undefined
      ? {}
      : { createdAfter: new Date(query.data.createdAfter) }),
  });
};

const encodeInput = (
  input: ListHistoryPlansInput,
): SerializedListHistoryPlansInput => ({
  params: { locationId: input.locationId },
  query: {
    limit: input.limit,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    ...(input.search === undefined ? {} : { search: input.search }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.createdAfter === undefined
      ? {}
      : { createdAfter: input.createdAfter.toISOString() }),
  },
});

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ListProductionHistoryPlansResult> => {
  const parsed = listProductionHistoryPlansResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ListProductionHistoryPlansResult): unknown => {
  const parsed = listProductionHistoryPlansResultSchema.safeParse(value);
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
): DecodeResult<ListHistoryPlansExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The list-history-plans failure is invalid.' },
    ]);

  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(listHistoryPlansLocationNotFound());

  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_history_cursor_invalid'
  )
    return decode.valid(listHistoryPlansCursorInvalid());

  return decode.invalid([
    { path: [], message: 'The list-history-plans failure is invalid.' },
  ]);
};

export const listHistoryPlansContract = defineCellContract<
  ListHistoryPlansInput,
  ListProductionHistoryPlansResult,
  ListHistoryPlansExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: encodeInput,
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
