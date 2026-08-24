import {
  productionShiftParamsSchema,
  updateProductionShiftRequestSchema,
  updateProductionShiftResultSchema,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { isUpdateShiftExpectedFailure } from './failures.ts';
import type {
  UpdateShiftCommand,
  UpdateShiftExpectedFailure,
  UpdateShiftResult,
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

const decodeInput = (serialized: unknown): DecodeResult<UpdateShiftCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The update-shift input must be an object.' },
    ]);

  const body = updateProductionShiftRequestSchema.safeParse(serialized['body']);
  const params = productionShiftParamsSchema.safeParse(serialized['params']);
  const actorId =
    typeof serialized['actorId'] === 'string' &&
    serialized['actorId'].length > 0
      ? serialized['actorId']
      : null;
  const issues: ContractIssue[] = [
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(actorId === null
      ? [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          },
        ]
      : []),
  ];
  if (!body.success || !params.success || actorId === null)
    return decode.invalid(issues);

  return decode.valid({
    locationId: params.data.locationId,
    productionShiftId: params.data.productionShiftId,
    startsAt: body.data.startsAt,
    endsAt: body.data.endsAt,
    effectiveFolderCount: body.data.effectiveFolderCount,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  });
};

const decodeOutput = (serialized: unknown): DecodeResult<UpdateShiftResult> => {
  const parsed = updateProductionShiftResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: UpdateShiftResult): unknown => {
  const parsed = updateProductionShiftResultSchema.safeParse(value);
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
): DecodeResult<UpdateShiftExpectedFailure> =>
  isUpdateShiftExpectedFailure(serialized)
    ? decode.valid(serialized)
    : decode.invalid([
        { path: [], message: 'The update-shift failure is invalid.' },
      ]);

export const updateShiftContract = defineCellContract<
  UpdateShiftCommand,
  UpdateShiftResult,
  UpdateShiftExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        productionShiftId: input.productionShiftId,
      },
      body: {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        effectiveFolderCount: input.effectiveFolderCount,
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
