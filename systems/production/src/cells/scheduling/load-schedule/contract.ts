import { productionScheduleParamsSchema } from './boundary.ts';
import {
  scheduleProposalSchema,
  type ScheduleProposal,
} from '../../../read-models/production-schedule/contract.ts';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { loadScheduleNotFound } from './failures.ts';
import type {
  LoadScheduleExpectedFailure,
  LoadScheduleInput,
} from './types.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const prefixedIssues = (
  prefix: 'output' | 'params',
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

const decodeInput = (serialized: unknown): DecodeResult<LoadScheduleInput> => {
  if (!isRecord(serialized))
    return decode.invalid([
      { path: [], message: 'The load-schedule input must be an object.' },
    ]);

  const params = productionScheduleParamsSchema.safeParse(serialized['params']);
  return params.success
    ? decode.valid({
        locationId: params.data.locationId,
        scheduleRunId: params.data.scheduleRunId,
      })
    : decode.invalid(prefixedIssues('params', params.error.issues));
};

const decodeOutput = (serialized: unknown): DecodeResult<ScheduleProposal> => {
  const parsed = scheduleProposalSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(prefixedIssues('output', parsed.error.issues));
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

const decodeFailure = (
  serialized: unknown,
): DecodeResult<LoadScheduleExpectedFailure> =>
  isRecord(serialized) &&
  serialized['tag'] === 'ProductionFailure' &&
  serialized['kind'] === 'not_found' &&
  serialized['code'] === 'schedule_not_found' &&
  serialized['message'] === 'The schedule proposal was not found.' &&
  serialized['safeMessage'] === 'The schedule proposal was not found.'
    ? decode.valid(loadScheduleNotFound())
    : decode.invalid([
        { path: [], message: 'The load-schedule failure is invalid.' },
      ]);

export const loadScheduleContract = defineCellContract<
  LoadScheduleInput,
  ScheduleProposal,
  LoadScheduleExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: (input) => ({
      params: {
        locationId: input.locationId,
        scheduleRunId: input.scheduleRunId,
      },
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
