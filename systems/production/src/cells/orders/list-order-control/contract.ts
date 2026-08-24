import {
  listProductionOrderControlQuerySchema,
  listProductionOrderControlResultSchema,
  type ListProductionOrderControlResult,
} from '../../../read-models/production-order-control/contract.ts';
import { productionLocationParamsSchema } from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  listOrderControlCursorInvalid,
  listOrderControlLocationNotFound,
} from './failures.ts';
import type {
  ListOrderControlExpectedFailure,
  ListOrderControlInput,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issues = (
  prefix: 'params' | 'query' | 'output',
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
): DecodeResult<ListOrderControlInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The list-order-control input must be an object.' },
    ]);
  const params = productionLocationParamsSchema.safeParse(serialized['params']);
  const query = listProductionOrderControlQuerySchema.safeParse(
    serialized['query'],
  );
  const failures = [
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(query.success ? [] : issues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(failures);
  return decode.valid({
    locationId: params.data.locationId,
    view: query.data.view,
    limit: query.data.limit,
    ...(query.data.search === undefined ? {} : { search: query.data.search }),
    ...(query.data.status === undefined ? {} : { status: query.data.status }),
    ...(query.data.dueBucket === undefined
      ? {}
      : { dueBucket: query.data.dueBucket }),
    ...(query.data.productionRunId === undefined
      ? {}
      : { productionRunId: query.data.productionRunId }),
    ...(query.data.productionBatchId === undefined
      ? {}
      : { productionBatchId: query.data.productionBatchId }),
    ...(query.data.stage === undefined ? {} : { stage: query.data.stage }),
    ...(query.data.priority === undefined
      ? {}
      : { priority: query.data.priority }),
    ...(query.data.movable === undefined
      ? {}
      : { movable: query.data.movable }),
    ...(query.data.cursor === undefined ? {} : { cursor: query.data.cursor }),
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ListProductionOrderControlResult> => {
  const parsed = listProductionOrderControlResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ListProductionOrderControlResult): unknown => {
  const parsed = listProductionOrderControlResultSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A list-order-control success result did not satisfy its serialized contract.',
      safeMessage: 'The production order-control result is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ListOrderControlExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The list-order-control failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(listOrderControlLocationNotFound());
  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'malformed' &&
    serialized['code'] === 'production_order_cursor_invalid'
  )
    return decode.valid(listOrderControlCursorInvalid());
  return decode.invalid([
    { path: [], message: 'The list-order-control failure is invalid.' },
  ]);
};

export const listOrderControlContract = defineCellContract<
  ListOrderControlInput,
  ListProductionOrderControlResult,
  ListOrderControlExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      query: {
        view: input.view,
        limit: input.limit,
        ...(input.search === undefined ? {} : { search: input.search }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.dueBucket === undefined
          ? {}
          : { dueBucket: input.dueBucket }),
        ...(input.productionRunId === undefined
          ? {}
          : { productionRunId: input.productionRunId }),
        ...(input.productionBatchId === undefined
          ? {}
          : { productionBatchId: input.productionBatchId }),
        ...(input.stage === undefined ? {} : { stage: input.stage }),
        ...(input.priority === undefined ? {} : { priority: input.priority }),
        ...(input.movable === undefined ? {} : { movable: input.movable }),
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
