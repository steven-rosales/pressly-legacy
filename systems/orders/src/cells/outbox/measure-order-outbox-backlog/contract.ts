import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { z } from 'zod';
import type { OrderOutboxBacklog } from '../../../model/order-outbox/model.ts';
import type {
  MeasureOrderOutboxBacklogExpectedFailure,
  MeasureOrderOutboxBacklogInput,
} from './types.ts';

const inputSchema = z.object({}).strict();
const outputSchema = z
  .object({
    pendingCount: z.number().int().nonnegative(),
    oldestPendingAgeSeconds: z.number().nonnegative(),
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

const decodeInput = (
  serialized: unknown,
): DecodeResult<MeasureOrderOutboxBacklogInput> => {
  const parsed = inputSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const decodeOutput = (
  serialized: unknown,
): DecodeResult<OrderOutboxBacklog> => {
  const parsed = outputSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const encodeOutput = (value: OrderOutboxBacklog): unknown => {
  const parsed = outputSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_outbox_backlog_result_invalid',
    message: 'An Order outbox backlog result violated its boundary contract.',
    safeMessage: 'Order outbox data is inconsistent.',
    cause: parsed.error,
  });
};

export const measureOrderOutboxBacklogContract = defineCellContract<
  MeasureOrderOutboxBacklogInput,
  OrderOutboxBacklog,
  MeasureOrderOutboxBacklogExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeInput,
    encode: () => ({}),
  }),
  output: defineBoundaryContract({
    version: 1,
    decode: decodeOutput,
    encode: encodeOutput,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: () =>
      decode.invalid([
        { path: [], message: 'Backlog measurement has no expected failure.' },
      ]),
    encode: (failure) => failure,
  }),
});
