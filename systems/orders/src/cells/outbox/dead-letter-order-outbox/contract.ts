import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { z } from 'zod';
import type {
  DeadLetterOrderOutboxCommand,
  DeadLetterOrderOutboxExpectedFailure,
  DeadLetterOrderOutboxResult,
} from './types.ts';

const commandSchema = z
  .object({
    eventId: z.string(),
    workerId: z.string(),
    errorCode: z.string(),
    errorMessage: z.string(),
  })
  .strict();
const resultSchema = z.object({ deadLettered: z.boolean() }).strict();
const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.literal('order_outbox_dead_letter_invalid'),
    message: z.string(),
  })
  .strict();

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
): DecodeResult<DeadLetterOrderOutboxCommand> => {
  const parsed = commandSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const decodeResult = (
  serialized: unknown,
): DecodeResult<DeadLetterOrderOutboxResult> => {
  const parsed = resultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<DeadLetterOrderOutboxExpectedFailure> => {
  const parsed = failureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const encodeResult = (value: DeadLetterOrderOutboxResult): unknown => {
  const parsed = resultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_dead_letter_outbox_result_invalid',
    message:
      'A dead-letter Order outbox result violated its boundary contract.',
    safeMessage: 'Order outbox data is inconsistent.',
    cause: parsed.error,
  });
};

export const deadLetterOrderOutboxContract = defineCellContract<
  DeadLetterOrderOutboxCommand,
  DeadLetterOrderOutboxResult,
  DeadLetterOrderOutboxExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeCommand,
    encode: (command) => ({ ...command }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeResult,
    encode: encodeResult,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
