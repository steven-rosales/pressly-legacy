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
  CompleteOrderOutboxCommand,
  CompleteOrderOutboxExpectedFailure,
  CompleteOrderOutboxResult,
} from './types.ts';

const commandSchema = z
  .object({ eventId: z.string(), workerId: z.string() })
  .strict();
const resultSchema = z.object({ completed: z.boolean() }).strict();

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

const parse = <Value>(schema: z.ZodType<Value>, serialized: unknown) => {
  const parsed = schema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const encodeResult = (value: CompleteOrderOutboxResult): unknown => {
  const parsed = resultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_complete_outbox_result_invalid',
    message: 'A complete Order outbox result violated its boundary contract.',
    safeMessage: 'Order outbox data is inconsistent.',
    cause: parsed.error,
  });
};

export const completeOrderOutboxContract = defineCellContract<
  CompleteOrderOutboxCommand,
  CompleteOrderOutboxResult,
  CompleteOrderOutboxExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<CompleteOrderOutboxCommand> =>
      parse(commandSchema, serialized),
    encode: (command) => ({ ...command }),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: (serialized): DecodeResult<CompleteOrderOutboxResult> =>
      parse(resultSchema, serialized),
    encode: encodeResult,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: () =>
      decode.invalid([
        { path: [], message: 'Outbox completion has no expected failure.' },
      ]),
    encode: (failure) => failure,
  }),
});
