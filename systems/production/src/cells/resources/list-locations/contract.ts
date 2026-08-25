import {
  listProductionLocationsQuerySchema,
  listProductionLocationsResultSchema,
  type ListProductionLocationsResult,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  ListLocationsExpectedFailure,
  ListLocationsInput,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const issues = (
  prefix: 'output' | 'query',
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: [prefix, ...issue.path.map(String)],
    message: issue.message,
  }));

const allowedLocationIds = (
  value: unknown,
): DecodeResult<readonly string[] | null> => {
  if (value === null) return decode.valid(null);
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.length > 0)
  )
    return decode.valid(Object.freeze([...value]));
  return decode.invalid([
    {
      path: ['authorization', 'allowedLocationIds'],
      message: 'Allowed location IDs must be null or an array of strings.',
    },
  ]);
};

const decodeInput = (serialized: unknown): DecodeResult<ListLocationsInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The list-locations input must be an object.' },
    ]);

  const query = listProductionLocationsQuerySchema.safeParse(
    serialized['query'],
  );
  const allowed = allowedLocationIds(serialized['allowedLocationIds']);
  const failures = [
    ...(query.success ? [] : issues('query', query.error.issues)),
    ...(allowed.kind === 'valid' ? [] : allowed.issues),
  ];
  if (!query.success || allowed.kind === 'invalid')
    return decode.invalid(failures);

  return decode.valid({
    includeInactive: query.data.includeInactive,
    allowedLocationIds: allowed.value,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ListProductionLocationsResult> => {
  const parsed = listProductionLocationsResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: ListProductionLocationsResult): unknown => {
  const parsed = listProductionLocationsResultSchema.safeParse(value);
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

export const listLocationsContract = defineCellContract<
  ListLocationsInput,
  ListProductionLocationsResult,
  ListLocationsExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      query: { includeInactive: input.includeInactive },
      allowedLocationIds: input.allowedLocationIds,
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: () =>
      decode.invalid([
        { path: [], message: 'List locations has no expected failure.' },
      ]),
    encode: (failure) => failure,
  }),
});
