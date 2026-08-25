import {
  listProductionOrdersQuerySchema,
  listProductionOrdersResultSchema,
  productionLocationParamsSchema,
  type ListProductionOrdersResult,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  listOrdersCursorInvalid,
  listOrdersLocationNotFound,
} from './failures.ts';
import type { ListOrdersExpectedFailure, ListOrdersInput } from './types.ts';

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

const decodeInput = (serialized: unknown): DecodeResult<ListOrdersInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The list-orders input must be an object.' },
    ]);
  const params = productionLocationParamsSchema.safeParse(serialized['params']);
  const query = listProductionOrdersQuerySchema.safeParse(serialized['query']);
  const failures = [
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(query.success ? [] : issues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(failures);

  return decode.valid({
    locationId: params.data.locationId,
    limit: query.data.limit,
    ...(query.data.status === undefined ? {} : { status: query.data.status }),
    ...(query.data.dueAfter === undefined
      ? {}
      : { dueAfter: new Date(query.data.dueAfter) }),
    ...(query.data.dueBefore === undefined
      ? {}
      : { dueBefore: new Date(query.data.dueBefore) }),
    ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ListProductionOrdersResult> => {
  const parsed = listProductionOrdersResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ListProductionOrdersResult): unknown => {
  const parsed = listProductionOrdersResultSchema.safeParse(value);
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
): DecodeResult<ListOrdersExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The list-orders failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(listOrdersLocationNotFound());
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_order_cursor_invalid'
  )
    return decode.valid(listOrdersCursorInvalid());
  return decode.invalid([
    { path: [], message: 'The list-orders failure is invalid.' },
  ]);
};

export const listOrdersContract = defineCellContract<
  ListOrdersInput,
  ListProductionOrdersResult,
  ListOrdersExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      query: {
        limit: input.limit,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.dueAfter === undefined
          ? {}
          : { dueAfter: input.dueAfter.toISOString() }),
        ...(input.dueBefore === undefined
          ? {}
          : { dueBefore: input.dueBefore.toISOString() }),
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
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
