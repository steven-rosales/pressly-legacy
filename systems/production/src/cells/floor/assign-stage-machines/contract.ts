import {
  assignStageMachinesRequestSchema,
  productionMutationResultSchema,
  productionStageParamsSchema,
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
  AssignStageMachinesCommand,
  AssignStageMachinesExpectedFailure,
  AssignStageMachinesResult,
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
    path: [prefix, ...issue.path.map((part) => String(part))],
    message: issue.message,
  }));

const decodeInput = (
  serialized: unknown,
): DecodeResult<AssignStageMachinesCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The machine-assignment input must be an object.' },
    ]);
  const body = assignStageMachinesRequestSchema.safeParse(serialized['body']);
  const params = productionStageParamsSchema.safeParse(serialized['params']);
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
    stageRunId: params.data.stageRunId,
    actorId,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
    machineIds: [...body.data.machineIds],
  });
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<AssignStageMachinesExpectedFailure> =>
  isRecord(serialized) &&
  (serialized['kind'] === 'conflict' || serialized['kind'] === 'not_found') &&
  typeof serialized['code'] === 'string' &&
  typeof serialized['message'] === 'string' &&
  typeof serialized['safeMessage'] === 'string'
    ? decode.valid({
        kind: serialized['kind'],
        code: serialized['code'],
        message: serialized['message'],
        safeMessage: serialized['safeMessage'],
      })
    : decode.invalid([
        { path: [], message: 'The assignment failure is invalid.' },
      ]);

const encodeOutput = (value: AssignStageMachinesResult): unknown => {
  const parsed = productionMutationResultSchema.safeParse(value);
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

export const assignStageMachinesContract = defineCellContract<
  AssignStageMachinesCommand,
  AssignStageMachinesResult,
  AssignStageMachinesExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId, stageRunId: input.stageRunId },
      body: {
        expectedVersion: input.expectedVersion,
        idempotencyKey: input.idempotencyKey,
        machineIds: [...input.machineIds],
      },
      actorId: input.actorId,
    }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (value) => {
      const parsed = productionMutationResultSchema.safeParse(value);
      return parsed.success
        ? decode.valid(parsed.data)
        : decode.invalid(issues('output', parsed.error.issues));
    },
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
