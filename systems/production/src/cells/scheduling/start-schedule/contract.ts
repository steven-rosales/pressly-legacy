import {
  productionScheduleParamsSchema,
  startScheduleRequestSchema,
  startScheduleResultSchema,
} from './boundary.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { isStartScheduleExpectedFailure } from './failures.ts';
import type {
  StartScheduleCommand,
  StartScheduleExpectedFailure,
  StartScheduleResult,
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
    path: [
      prefix,
      ...issue.path.map((part) =>
        typeof part === 'string' || typeof part === 'number'
          ? part
          : String(part),
      ),
    ],
    message: issue.message,
  }));

const decodeInput = (value: unknown): DecodeResult<StartScheduleCommand> => {
  if (!isRecord(value))
    return decode.invalid([
      { path: [], message: 'The start-schedule input must be an object.' },
    ]);
  const body = startScheduleRequestSchema.safeParse(value['body']);
  const params = productionScheduleParamsSchema.safeParse(value['params']);
  const actorId =
    typeof value['actorId'] === 'string' && value['actorId'].length > 0
      ? value['actorId']
      : null;
  const allIssues = [
    ...(body.success ? [] : issues('body', body.error.issues)),
    ...(params.success ? [] : issues('params', params.error.issues)),
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
    return decode.invalid(allIssues);
  return decode.valid({
    locationId: params.data.locationId,
    scheduleRunId: params.data.scheduleRunId,
    expectedOutputPlanHash: body.data.expectedOutputPlanHash,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  });
};

const decodeOutput = (value: unknown): DecodeResult<StartScheduleResult> => {
  const parsed = startScheduleResultSchema.safeParse(value);
  return parsed.success
    ? decode.valid({
        ...parsed.data,
        productionBatchIds: [...parsed.data.productionBatchIds],
      })
    : decode.invalid(issues('output', parsed.error.issues));
};

const encodeOutput = (value: StartScheduleResult): unknown => {
  const parsed = startScheduleResultSchema.safeParse({
    ...value,
    productionBatchIds: [...value.productionBatchIds],
  });
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

export const startScheduleContract = defineCellContract<
  StartScheduleCommand,
  StartScheduleResult,
  StartScheduleExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        scheduleRunId: input.scheduleRunId,
      },
      body: {
        expectedOutputPlanHash: input.expectedOutputPlanHash,
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
    decode: (value) =>
      isStartScheduleExpectedFailure(value)
        ? decode.valid(value)
        : decode.invalid([
            { path: [], message: 'The start-schedule failure is invalid.' },
          ]),
    encode: (failure) => ({ ...failure }),
  }),
});
