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
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderExpectedFailure,
  ProposeIncomingOrderResult,
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

const itemSchema = z
  .object({
    lineKey: z.string(),
    itemType: z.string(),
    code: z.string(),
    description: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unitPriceCents: z.number().int(),
    totalAmountCents: z.number().int(),
    sourceMetadata: jsonObjectSchema,
  })
  .strict();

const customerSchema = z
  .object({
    externalUserId: z.string(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    businessName: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    normalizedPayload: jsonObjectSchema,
  })
  .strict();

const commandSchema = z
  .object({
    context: contextSchema,
    source: z.string(),
    externalOrderId: z.string(),
    proposalKind: z.literal('submitted_order'),
    snapshot: z
      .object({
        customer: customerSchema.nullable(),
        displayNumber: z.string().nullable(),
        dueAt: utcSchema,
        currency: z.string(),
        totalAmountCents: z.number().int(),
        balanceDueCents: z.number().int().nullable(),
        items: z.array(itemSchema),
        fulfillment: z
          .object({
            typeCode: z.string(),
            locationId: z.string(),
            estimatedWeightLbs: z.number().nullable(),
            estimatedWeightSource: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
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

const resultSchema = z
  .object({
    proposalId: z.string().uuid().nullable(),
    version: z.number().int().nullable(),
    replayed: z.boolean(),
    outcome: z.enum([
      'proposed',
      'existing_proposal',
      'existing_order',
      'source_closed',
    ]),
  })
  .strict();

const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.literal('incoming_order_proposal_invalid'),
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

const invalid = (values: readonly ContractIssue[]) => decode.invalid(values);

const decodeCommand = (
  serialized: unknown,
): DecodeResult<ProposeIncomingOrderCommand> => {
  const parsed = commandSchema.safeParse(serialized);
  if (!parsed.success) return invalid(issues(parsed.error.issues));
  return decode.valid({
    ...parsed.data,
    snapshot: {
      ...parsed.data.snapshot,
      dueAt: new Date(parsed.data.snapshot.dueAt),
    },
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
    message: 'An incoming Order proposal contains an invalid timestamp.',
    safeMessage: 'Incoming Order proposal data is inconsistent.',
  });
};

const encodeCommand = (command: ProposeIncomingOrderCommand): unknown => ({
  ...command,
  snapshot: {
    ...command.snapshot,
    dueAt: utc(
      command.snapshot.dueAt,
      'incoming_order_proposal_due_timestamp_invalid',
    ),
  },
  revision: {
    ...command.revision,
    at: utc(
      command.revision.at,
      'incoming_order_proposal_revision_timestamp_invalid',
    ),
    observedAt: utc(
      command.revision.observedAt,
      'incoming_order_proposal_observed_timestamp_invalid',
    ),
  },
});

const decodeResult = (
  serialized: unknown,
): DecodeResult<ProposeIncomingOrderResult> => {
  const parsed = resultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

const encodeResult = (value: ProposeIncomingOrderResult): unknown => {
  const parsed = resultSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'incoming_order_proposal_result_invalid',
    message: 'An incoming Order proposal result violated its contract.',
    safeMessage: 'Incoming Order proposal data is inconsistent.',
    cause: parsed.error,
  });
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ProposeIncomingOrderExpectedFailure> => {
  const parsed = failureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

export const proposeIncomingOrderContract = defineCellContract<
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderResult,
  ProposeIncomingOrderExpectedFailure
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
