import {
  productionWorkspaceParamsSchema,
  productionWorkspaceQuerySchema,
} from './boundary.ts';
import {
  productionWorkspaceSchema,
  type ProductionWorkspace,
} from '../../../read-models/production-board/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  loadWorkspaceLivePlacementConflict,
  loadWorkspaceLocationNotFound,
  loadWorkspaceShiftNotFound,
} from './failures.ts';
import type {
  LoadWorkspaceExpectedFailure,
  LoadWorkspaceInput,
} from './types.ts';

type SerializedLoadWorkspaceInput = Readonly<{
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

const decodeInput = (serialized: unknown): DecodeResult<LoadWorkspaceInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The load-workspace input must be an object.' },
    ]);
  const params = productionWorkspaceParamsSchema.safeParse(
    serialized['params'],
  );
  const query = productionWorkspaceQuerySchema.safeParse(serialized['query']);
  const issues = [
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(query.success ? [] : prefixedIssues('query', query.error.issues)),
  ];
  if (!params.success || !query.success) return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    // The deployed route has no shift path segment. Preserve the current
    // params schema tolerance while selecting only the explicit query value.
    ...(query.data.shiftId === undefined
      ? {}
      : { shiftId: query.data.shiftId }),
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ProductionWorkspace> => {
  const parsed = productionWorkspaceSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ProductionWorkspace): unknown => {
  const parsed = productionWorkspaceSchema.safeParse(value);
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
): DecodeResult<LoadWorkspaceExpectedFailure> => {
  if (!isRecord(serialized) || serialized['tag'] !== 'ProductionFailure')
    return decode.invalid([
      { path: [], message: 'The load-workspace failure is invalid.' },
    ]);
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_location_not_found'
  )
    return decode.valid(loadWorkspaceLocationNotFound());
  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'production_shift_not_found'
  )
    return decode.valid(loadWorkspaceShiftNotFound());
  if (
    serialized['kind'] === 'conflict' &&
    serialized['code'] === 'production_live_placement_run_mismatch'
  )
    return decode.valid(loadWorkspaceLivePlacementConflict());
  return decode.invalid([
    { path: [], message: 'The load-workspace failure is invalid.' },
  ]);
};

export const loadWorkspaceContract = defineCellContract<
  LoadWorkspaceInput,
  ProductionWorkspace,
  LoadWorkspaceExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input): SerializedLoadWorkspaceInput => ({
      params: { locationId: input.locationId },
      query: {
        ...(input.shiftId === undefined ? {} : { shiftId: input.shiftId }),
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
