import {
  productionBoardSchema,
  type ProductionBoard,
} from '../../../read-models/production-board/contract.ts';
import { productionRunBoardParamsSchema } from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { loadBoardNotFound } from './failures.ts';
import type { LoadBoardExpectedFailure, LoadBoardInput } from './types.ts';

type SerializedLoadBoardInput = Readonly<{ params: unknown }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const prefixedIssues = (
  prefix: 'output' | 'params',
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

const decodeInput = (serialized: unknown): DecodeResult<LoadBoardInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The load-board input must be an object.' },
    ]);

  const params = productionRunBoardParamsSchema.safeParse(serialized['params']);
  return params.success
    ? decode.valid({
        locationId: params.data.locationId,
        productionRunId: params.data.productionRunId,
      })
    : decode.invalid(prefixedIssues('params', params.error.issues));
};

const decodeOutput = (serialized: unknown): DecodeResult<ProductionBoard> => {
  const parsed = productionBoardSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ProductionBoard): unknown => {
  const parsed = productionBoardSchema.safeParse(value);
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
): DecodeResult<LoadBoardExpectedFailure> => {
  if (
    isRecord(serialized) &&
    serialized['tag'] === 'ProductionFailure' &&
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_board_not_found'
  )
    return decode.valid(loadBoardNotFound());

  return decode.invalid([
    { path: [], message: 'The load-board failure is invalid.' },
  ]);
};

export const loadBoardContract = defineCellContract<
  LoadBoardInput,
  ProductionBoard,
  LoadBoardExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input): SerializedLoadBoardInput => ({
      params: {
        locationId: input.locationId,
        productionRunId: input.productionRunId,
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
