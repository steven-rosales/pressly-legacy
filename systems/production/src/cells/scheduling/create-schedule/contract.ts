import {
  createScheduleRequestSchema,
  productionLocationParamsSchema,
} from './boundary.ts';
import { scheduleProposalSchema } from '../../../read-models/production-schedule/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import { isCreateScheduleExpectedFailure } from './failures.ts';
import type {
  CreateScheduleCommand,
  CreateScheduleExpectedFailure,
} from './types.ts';

const record = (value: unknown): value is Record<string, unknown> =>
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
const decodeInput = (value: unknown): DecodeResult<CreateScheduleCommand> => {
  if (!record(value))
    return decode.invalid([
      { path: [], message: 'The create-schedule input must be an object.' },
    ]);
  const body = createScheduleRequestSchema.safeParse(value['body']);
  const params = productionLocationParamsSchema.safeParse(value['params']);
  const actorId =
    typeof value['actorId'] === 'string' && value['actorId'].length > 0
      ? value['actorId']
      : null;
  const all = [
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
    return decode.invalid(all);
  return decode.valid({
    locationId: params.data.locationId,
    productionShiftId: body.data.productionShiftId,
    schedulerConfigId: body.data.schedulerConfigId,
    idempotencyKey: body.data.idempotencyKey,
    actorId,
  });
};
const decodeOutput = (value: unknown): DecodeResult<ScheduleProposal> => {
  const parsed = scheduleProposalSchema.safeParse(value);
  if (!parsed.success)
    return decode.invalid(issues('output', parsed.error.issues));
  return decode.valid({
    ...parsed.data,
    batches: parsed.data.batches.map((batch) => ({
      ...batch,
      orderIds: [...batch.orderIds],
      stages: batch.stages.map((stage) => ({
        ...stage,
        machineIds: [...stage.machineIds],
      })),
    })),
    unplacedOrderIds: [...parsed.data.unplacedOrderIds],
    warnings: parsed.data.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      blocking: warning.blocking,
      ...(warning.orderIds === undefined
        ? {}
        : { orderIds: [...warning.orderIds] }),
    })),
    acknowledgedWarningCodes: [...parsed.data.acknowledgedWarningCodes],
  });
};
const encodeOutput = (value: ScheduleProposal): unknown => {
  const parsed = scheduleProposalSchema.safeParse(value);
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

export const createScheduleContract = defineCellContract<
  CreateScheduleCommand,
  ScheduleProposal,
  CreateScheduleExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: { locationId: input.locationId },
      body: {
        productionShiftId: input.productionShiftId,
        schedulerConfigId: input.schedulerConfigId,
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
      isCreateScheduleExpectedFailure(value)
        ? decode.valid(value)
        : decode.invalid([
            { path: [], message: 'The create-schedule failure is invalid.' },
          ]),
    encode: (failure) => ({ ...failure }),
  }),
});
