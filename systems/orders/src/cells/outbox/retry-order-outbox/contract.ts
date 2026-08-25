import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { isUtcIso } from '@pressly/time';
import { z } from 'zod';
import type {
  RetryOrderOutboxCommand,
  RetryOrderOutboxExpectedFailure,
  RetryOrderOutboxResult,
} from './types.ts';

const serializedCommandSchema = z
  .object({
    eventId: z.string(),
    workerId: z.string(),
    availableAt: z
      .string()
      .refine(
        (value): boolean => isUtcIso(value),
        'Expected a UTC ISO datetime.',
      ),
    errorCode: z.string(),
    errorMessage: z.string(),
  })
  .strict();
const resultSchema = z.object({ retried: z.boolean() }).strict();

const issues = (
  values: readonly Readonly<{
    path: readonly PropertyKey[];
    message: string;
  }>[],
): readonly ContractIssue[] =>
  values.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }));

const decodeCommand = (
  serialized: unknown,
): DecodeResult<RetryOrderOutboxCommand> => {
  const parsed = serializedCommandSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid({
        ...parsed.data,
        availableAt: new Date(parsed.data.availableAt),
      })
    : decode.invalid(issues(parsed.error.issues));
};

const encodeCommand = (command: RetryOrderOutboxCommand): unknown => {
  if (!Number.isFinite(command.availableAt.getTime()))
    throw invariantViolationError({
      code: 'orders_retry_outbox_available_at_invalid',
      message: 'An Order outbox retry contains an invalid timestamp.',
      safeMessage: 'Order outbox data is inconsistent.',
    });
  const parsed = serializedCommandSchema.safeParse({
    ...command,
    availableAt: command.availableAt.toISOString(),
  });
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_retry_outbox_command_invalid',
    message: 'An Order outbox retry violated its boundary contract.',
    safeMessage: 'Order outbox data is inconsistent.',
    cause: parsed.error,
  });
};

const decodeResult = (
  serialized: unknown,
): DecodeResult<RetryOrderOutboxResult> => {
  const parsed = resultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const encodeResult = (value: RetryOrderOutboxResult): unknown => {
  const parsed = resultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_retry_outbox_result_invalid',
    message: 'A retry Order outbox result violated its boundary contract.',
    safeMessage: 'Order outbox data is inconsistent.',
    cause: parsed.error,
  });
};

export const retryOrderOutboxContract = defineCellContract<
  RetryOrderOutboxCommand,
  RetryOrderOutboxResult,
  RetryOrderOutboxExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeCommand,
    encode: encodeCommand,
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeResult,
    encode: encodeResult,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: () =>
      decode.invalid([
        { path: [], message: 'Outbox retry has no expected failure.' },
      ]),
    encode: (failure) => failure,
  }),
});
