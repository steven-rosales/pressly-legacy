import {
  changeProductionAdmissionRequestSchema,
  changeProductionAdmissionResultSchema,
  productionOrderParamsSchema,
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
  ChangeAdmissionCommand,
  ChangeAdmissionExpectedFailure,
  ChangeAdmissionResult,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const prefixedIssues = (
  prefix: string,
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
): DecodeResult<ChangeAdmissionCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The change-admission input must be an object.' },
    ]);

  const params = productionOrderParamsSchema.safeParse(serialized['params']);
  const body = changeProductionAdmissionRequestSchema.safeParse(
    serialized['body'],
  );
  const actorId =
    typeof serialized['actorId'] === 'string' &&
    serialized['actorId'].length > 0
      ? serialized['actorId']
      : null;
  const issues: ContractIssue[] = [
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
    ...(actorId === null
      ? [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          },
        ]
      : []),
  ];
  if (!params.success || !body.success || actorId === null)
    return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    productionOrderId: params.data.productionOrderId,
    actorId,
    target: body.data.target,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<ChangeAdmissionResult> => {
  const parsed = changeProductionAdmissionResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: ChangeAdmissionResult): unknown => {
  const parsed = changeProductionAdmissionResultSchema.safeParse(value);
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
): DecodeResult<ChangeAdmissionExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    (serialized['kind'] !== 'not_found' && serialized['kind'] !== 'conflict') ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The change-admission failure is invalid.' },
    ]);

  return decode.valid({
    kind: serialized['kind'],
    code: serialized['code'],
    message: serialized['message'],
    safeMessage: serialized['safeMessage'],
  });
};

export const changeAdmissionContract = defineCellContract<
  ChangeAdmissionCommand,
  ChangeAdmissionResult,
  ChangeAdmissionExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        productionOrderId: input.productionOrderId,
      },
      body: {
        target: input.target,
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
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
