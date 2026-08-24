import { jsonObjectSchema } from '@pressly/codec/zod';
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
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceExpectedFailure,
  CloseIncomingOrderSourceResult,
} from './types.ts';

const utcSchema = z
  .string()
  .refine((value): boolean => isUtcIso(value), 'Expected a UTC ISO datetime.');

const contextSchema = z
  .object({
    origin: z.string(),
    principal: z
      .object({
        id: z.string(),
        kind: z.enum(['human', 'service', 'system']),
      })
      .strict(),
  })
  .strict();

const commandSchema = z
  .object({
    context: contextSchema,
    source: z.string(),
    externalOrderId: z.string(),
    terminalCode: z.enum(['completed', 'canceled']),
    revision: z
      .object({
        at: utcSchema,
        hash: z.string(),
        adapterVersion: z.string(),
        observedAt: utcSchema,
        normalizedPayload: jsonObjectSchema,
      })
      .strict(),
  })
  .strict();

const canonicalSchema = z
  .object({
    orderId: z.string().uuid(),
    fulfillmentId: z.string().uuid(),
    locationId: z.string(),
    releaseState: z.enum(['unreleased', 'released', 'withdrawn']),
  })
  .strict();

const resultSchema = z
  .object({
    outcome: z.enum([
      'source_closed',
      'tombstoned',
      'existing_order',
      'already_decided',
      'already_source_closed',
    ]),
    proposalId: z.string().uuid().nullable(),
    version: z.number().int().nullable(),
    canonical: canonicalSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

const failureSchema = z.discriminatedUnion('code', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('incoming_order_source_close_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('order_idempotency_conflict'),
      message: z.string(),
    })
    .strict(),
]);

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

const invalid = (values: readonly ContractIssue[]) => decode.invalid(values);

const decodeCommand = (
  serialized: unknown,
): DecodeResult<CloseIncomingOrderSourceCommand> => {
  const parsed = commandSchema.safeParse(serialized);
  if (!parsed.success) return invalid(issues(parsed.error.issues));
  return decode.valid({
    ...parsed.data,
    revision: {
      ...parsed.data.revision,
      at: new Date(parsed.data.revision.at),
      observedAt: new Date(parsed.data.revision.observedAt),
    },
  });
};

const utc = (value: Date, code: string): string => {
  if (Number.isFinite(value.getTime())) return value.toISOString();
  throw invariantViolationError({
    code,
    message: 'An incoming source-close command contains an invalid timestamp.',
    safeMessage: 'Incoming source-close data is inconsistent.',
  });
};

const encodeCommand = (command: CloseIncomingOrderSourceCommand): unknown => ({
  ...command,
  revision: {
    ...command.revision,
    at: utc(
      command.revision.at,
      'incoming_order_source_close_revision_timestamp_invalid',
    ),
    observedAt: utc(
      command.revision.observedAt,
      'incoming_order_source_close_observed_timestamp_invalid',
    ),
  },
});

const decodeResult = (
  serialized: unknown,
): DecodeResult<CloseIncomingOrderSourceResult> => {
  const parsed = resultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

const encodeResult = (value: CloseIncomingOrderSourceResult): unknown => {
  const parsed = resultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'incoming_order_source_close_result_invalid',
    message: 'An incoming source-close result violated its contract.',
    safeMessage: 'Incoming source-close data is inconsistent.',
    cause: parsed.error,
  });
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<CloseIncomingOrderSourceExpectedFailure> => {
  const parsed = failureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

export const closeIncomingOrderSourceContract = defineCellContract<
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
  CloseIncomingOrderSourceExpectedFailure
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
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
