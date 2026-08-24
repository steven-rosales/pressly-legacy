import {
  acceptScheduleRequestSchema,
  acceptScheduleResultSchema,
  productionScheduleParamsSchema,
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
  AcceptScheduleCommand,
  AcceptScheduleConflictCode,
  AcceptScheduleExpectedFailure,
  AcceptScheduleResult,
} from './types.ts';

type SerializedAcceptScheduleInput = Readonly<{
  params: unknown;
  body: unknown;
  actorId: unknown;
}>;

const conflictCodes = new Set<AcceptScheduleConflictCode>([
  'production_idempotency_conflict',
  'production_shift_window_invalid',
  'production_shift_expired',
  'production_shift_already_started',
  'schedule_not_draft',
  'schedule_hash_mismatch',
  'schedule_warning_acknowledgement_invalid',
  'schedule_warning_not_acknowledged',
  'schedule_has_no_batches',
  'batch_capacity_exceeded',
  'batch_stage_count_invalid',
  'batch_has_no_orders',
  'batch_stage_order_invalid',
  'stage_pulse_mismatch',
  'batch_stage_gap_invalid',
  'order_split_across_batches',
  'schedule_not_current',
  'schedule_input_snapshot_stale',
  'production_schedule_already_accepted',
]);

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
): DecodeResult<AcceptScheduleCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The accept-schedule input must be an object.' },
    ]);

  const input: SerializedAcceptScheduleInput = {
    params: serialized['params'],
    body: serialized['body'],
    actorId: serialized['actorId'],
  };
  const body = acceptScheduleRequestSchema.safeParse(input.body);
  const params = productionScheduleParamsSchema.safeParse(input.params);
  const actorId =
    typeof input.actorId === 'string' && input.actorId.length > 0
      ? input.actorId
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
    scheduleRunId: params.data.scheduleRunId,
    expectedOutputPlanHash: body.data.expectedOutputPlanHash,
    acknowledgedWarningCodes: [...body.data.acknowledgedWarningCodes],
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  });
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<AcceptScheduleResult> => {
  const parsed = acceptScheduleResultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: AcceptScheduleResult): unknown => {
  const parsed = acceptScheduleResultSchema.safeParse(value);
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
): DecodeResult<AcceptScheduleExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The accept-schedule failure is invalid.' },
    ]);

  if (
    serialized['kind'] === 'not_found' &&
    serialized['code'] === 'schedule_not_found'
  )
    return decode.valid({
      kind: 'not_found',
      code: 'schedule_not_found',
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });

  if (
    serialized['kind'] === 'conflict' &&
    conflictCodes.has(serialized['code'] as AcceptScheduleConflictCode)
  )
    return decode.valid({
      kind: 'conflict',
      code: serialized['code'] as AcceptScheduleConflictCode,
      message: serialized['message'],
      safeMessage: serialized['safeMessage'],
    });

  return decode.invalid([
    { path: [], message: 'The accept-schedule failure is invalid.' },
  ]);
};

export const acceptScheduleContract = defineCellContract<
  AcceptScheduleCommand,
  AcceptScheduleResult,
  AcceptScheduleExpectedFailure
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
        acknowledgedWarningCodes: [...input.acknowledgedWarningCodes],
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
