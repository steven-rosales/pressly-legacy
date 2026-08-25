import {
  advanceProductionStageResultSchema,
  completeStageRequestSchema,
  productionStageParamsSchema,
  startStageRequestSchema,
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
  AdvanceStageCommand,
  AdvanceStageExpectedFailure,
  AdvanceStageResult,
} from './types.ts';

type SerializedAdvanceStageInput = Readonly<{
  transition: unknown;
  params: unknown;
  body: unknown;
  actorId: unknown;
}>;

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
): DecodeResult<AdvanceStageCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The advance-stage input must be an object.' },
    ]);

  const input: SerializedAdvanceStageInput = {
    transition: serialized['transition'],
    params: serialized['params'],
    body: serialized['body'],
    actorId: serialized['actorId'],
  };
  if (input.transition !== 'start' && input.transition !== 'complete')
    return decode.invalid([
      {
        path: ['transition'],
        message: 'The transition must be start or complete.',
      },
    ]);

  const params = productionStageParamsSchema.safeParse(input.params);
  const body =
    input.transition === 'start'
      ? startStageRequestSchema.safeParse(input.body)
      : completeStageRequestSchema.safeParse(input.body);
  const actorId =
    typeof input.actorId === 'string' && input.actorId.length > 0
      ? input.actorId
      : null;
  const issues: ContractIssue[] = [
    ...(params.success ? [] : prefixedIssues('params', params.error.issues)),
    ...(body.success ? [] : prefixedIssues('body', body.error.issues)),
    ...(actorId !== null
      ? []
      : [
          {
            path: ['actorId'],
            message: 'An authenticated actor ID is required.',
          } satisfies ContractIssue,
        ]),
  ];
  if (!params.success || !body.success || actorId === null)
    return decode.invalid(issues);

  const scope = {
    locationId: params.data.locationId,
    stageRunId: params.data.stageRunId,
    expectedVersion: body.data.expectedVersion,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  };
  const confirmation =
    body.data.confirmation === undefined
      ? {}
      : { confirmation: body.data.confirmation };
  return input.transition === 'start'
    ? decode.valid({ ...scope, transition: 'start', ...confirmation })
    : decode.valid({ ...scope, transition: 'complete', ...confirmation });
};

const encodeInput = (
  input: AdvanceStageCommand,
): SerializedAdvanceStageInput => ({
  transition: input.transition,
  params: {
    locationId: input.locationId,
    stageRunId: input.stageRunId,
  },
  body: {
    expectedVersion: input.expectedVersion,
    idempotencyKey: input.idempotencyKey,
    ...(input.confirmation === undefined
      ? {}
      : { confirmation: input.confirmation }),
  },
  actorId: input.actorId,
});

const decodeOutput = (
  serialized: unknown,
): DecodeResult<AdvanceStageResult> => {
  const parsed = advanceProductionStageResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: AdvanceStageResult): unknown => {
  const parsed = advanceProductionStageResultSchema.safeParse(value);
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
): DecodeResult<AdvanceStageExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    (serialized['kind'] !== 'not_found' && serialized['kind'] !== 'conflict') ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      {
        path: [],
        message: 'The advance-stage failure is invalid.',
      },
    ]);

  return decode.valid({
    kind: serialized['kind'],
    code: serialized['code'],
    message: serialized['message'],
    safeMessage: serialized['safeMessage'],
  });
};

export const advanceStageContract = defineCellContract<
  AdvanceStageCommand,
  AdvanceStageResult,
  AdvanceStageExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: encodeInput,
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
