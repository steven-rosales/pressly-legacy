import {
  productionHistoryRunDetailSchema,
  productionHistoryRunParamsSchema,
  type ProductionHistoryRunDetail,
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
  loadHistoryRunLocationNotFound,
  loadHistoryRunNotFound,
} from './failures.ts';
import type {
  LoadHistoryRunExpectedFailure,
  LoadHistoryRunInput,
} from './types.ts';

const issues = (
  prefix: 'input' | 'output',
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
): DecodeResult<LoadHistoryRunInput> => {
  const parsed = productionHistoryRunParamsSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid({ ...parsed.data })
    : decode.invalid(issues('input', parsed.error.issues));
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ProductionHistoryRunDetail> => {
  const parsed = productionHistoryRunDetailSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ProductionHistoryRunDetail): unknown => {
  const parsed = productionHistoryRunDetailSchema.safeParse(value);
  if (!parsed.success)
    throw invariantViolationError({
      code: 'invalid_cell_success_response',
      message:
        'A load-history-run success result did not satisfy its serialized contract.',
      safeMessage: 'The production run history result is invalid.',
      cause: parsed.error,
    });
  return parsed.data;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeFailure = (
  serialized: unknown,
): DecodeResult<LoadHistoryRunExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    serialized['tag'] !== 'ProductionFailure' ||
    serialized['kind'] !== 'not_found'
  )
    return decode.invalid([
      { path: [], message: 'The load-history-run failure is invalid.' },
    ]);
  if (serialized['code'] === 'production_location_not_found')
    return decode.valid(loadHistoryRunLocationNotFound());
  if (serialized['code'] === 'production_history_run_not_found')
    return decode.valid(loadHistoryRunNotFound());
  return decode.invalid([
    { path: [], message: 'The load-history-run failure is invalid.' },
  ]);
};

export const loadHistoryRunContract = defineCellContract<
  LoadHistoryRunInput,
  ProductionHistoryRunDetail,
  LoadHistoryRunExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({ ...input }),
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
