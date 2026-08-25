import {
  productionOrderParamsSchema,
  recordOrderIntakeRequestSchema,
  recordOrderIntakeResultSchema,
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
  RecordOrderIntakeCommand,
  RecordOrderIntakeExpectedFailure,
  RecordOrderIntakeResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const issues = (
  prefix: string,
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
): DecodeResult<RecordOrderIntakeCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The record-intake input must be an object.' },
    ]);

  const body = recordOrderIntakeRequestSchema.safeParse(serialized['body']);
  const params = productionOrderParamsSchema.safeParse(serialized['params']);
  const actorId = serialized['actorId'];
  const failures: ContractIssue[] = [
    ...(body.success ? [] : issues('body', body.error.issues)),
    ...(params.success ? [] : issues('params', params.error.issues)),
    ...(typeof actorId === 'string' && actorId.length > 0
      ? []
      : [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          },
        ]),
  ];
  if (
    !body.success ||
    !params.success ||
    typeof actorId !== 'string' ||
    actorId.length === 0
  )
    return decode.invalid(failures);

  return decode.valid({
    locationId: params.data.locationId,
    productionOrderId: params.data.productionOrderId,
    actorId,
    bagCount: body.data.bagCount,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<RecordOrderIntakeResult> => {
  const parsed = recordOrderIntakeResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: RecordOrderIntakeResult): unknown => {
  const parsed = recordOrderIntakeResultSchema.safeParse(value);
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
): DecodeResult<RecordOrderIntakeExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    (serialized['kind'] !== 'not_found' && serialized['kind'] !== 'conflict') ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The record-intake failure is invalid.' },
    ]);

  return decode.valid({
    kind: serialized['kind'],
    code: serialized['code'],
    message: serialized['message'],
    safeMessage: serialized['safeMessage'],
  });
};

export const recordOrderIntakeContract = defineCellContract<
  RecordOrderIntakeCommand,
  RecordOrderIntakeResult,
  RecordOrderIntakeExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      body: {
        bagCount: input.bagCount,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
      },
      params: {
        locationId: input.locationId,
        productionOrderId: input.productionOrderId,
      },
      actorId: input.actorId,
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
