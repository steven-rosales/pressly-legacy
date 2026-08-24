import {
  productionLocationParamsSchema,
  publishSchedulerConfigRequestSchema,
} from './boundary.ts';
import { schedulerConfigSchema } from '../../../read-models/production-schedule/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  PublishSchedulerConfigCommand,
  PublishSchedulerConfigExpectedFailure,
  SchedulerConfig,
} from './types.ts';

type SerializedPublishSchedulerConfigInput = Readonly<{
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
): DecodeResult<PublishSchedulerConfigCommand> => {
  if (!isRecord(serialized))
    return decode.invalid([
      {
        path: [],
        message: 'The publish-scheduler-config input must be an object.',
      },
    ]);

  const input: SerializedPublishSchedulerConfigInput = {
    params: serialized['params'],
    body: serialized['body'],
    actorId: serialized['actorId'],
  };
  const body = publishSchedulerConfigRequestSchema.safeParse(input.body);
  const params = productionLocationParamsSchema.safeParse(input.params);
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
    actorId,
    pulseMinutes: body.data.pulseMinutes,
    foldLbsPerFolderMinute: body.data.foldLbsPerFolderMinute,
    stageFitAssertion: body.data.stageFitAssertion,
    idempotencyKey: body.data.idempotencyKey,
  });
};

const decodeOutput = (serialized: unknown): DecodeResult<SchedulerConfig> => {
  const parsed = schedulerConfigSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
};

const encodeOutput = (value: SchedulerConfig): unknown => {
  const parsed = schedulerConfigSchema.safeParse(value);
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
): DecodeResult<PublishSchedulerConfigExpectedFailure> => {
  if (
    !isRecord(serialized) ||
    typeof serialized['code'] !== 'string' ||
    typeof serialized['message'] !== 'string' ||
    typeof serialized['safeMessage'] !== 'string'
  )
    return decode.invalid([
      { path: [], message: 'The publish-scheduler-config failure is invalid.' },
    ]);

  if (
    serialized['kind'] === 'validation' &&
    serialized['classification'] === 'semantic' &&
    serialized['code'] === 'scheduler_config_invalid' &&
    serialized['message'] === 'Scheduler values must be positive.' &&
    serialized['safeMessage'] === 'Scheduler values must be positive.'
  )
    return decode.valid({
      kind: 'validation',
      classification: 'semantic',
      code: 'scheduler_config_invalid',
      message: 'Scheduler values must be positive.',
      safeMessage: 'Scheduler values must be positive.',
    });

  if (
    serialized['kind'] === 'conflict' &&
    serialized['code'] === 'production_idempotency_conflict' &&
    serialized['message'] ===
      'The idempotency key belongs to a different production command.' &&
    serialized['safeMessage'] ===
      'The idempotency key belongs to a different production command.'
  )
    return decode.valid({
      kind: 'conflict',
      code: 'production_idempotency_conflict',
      message: 'The idempotency key belongs to a different production command.',
      safeMessage:
        'The idempotency key belongs to a different production command.',
    });

  return decode.invalid([
    { path: [], message: 'The publish-scheduler-config failure is invalid.' },
  ]);
};

export const publishSchedulerConfigContract = defineCellContract<
  PublishSchedulerConfigCommand,
  SchedulerConfig,
  PublishSchedulerConfigExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      body: {
        pulseMinutes: input.pulseMinutes,
        foldLbsPerFolderMinute: input.foldLbsPerFolderMinute,
        stageFitAssertion: input.stageFitAssertion,
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
