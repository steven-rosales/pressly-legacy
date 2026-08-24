import { jsonValueSchema } from '@pressly/codec/zod';
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
import { fulfillmentDemandChangedV2PayloadSchema } from '../../../contracts/fulfillment-demand-changed-v2.ts';
import type { ClaimedOrderOutboxEvent } from '../../../model/order-outbox/model.ts';
import type {
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxExpectedFailure,
  ClaimOrderOutboxResult,
} from './types.ts';

const commandSchema = z
  .object({
    workerId: z.string(),
    limit: z.number(),
    leaseMs: z.number(),
  })
  .strict();

const claimedBaseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  fulfillmentId: z.string().uuid(),
  aggregateVersion: z.number().int(),
  attempts: z.number().int().nonnegative(),
  leaseOwner: z.string(),
  leaseExpiresAt: z
    .string()
    .refine(
      (value): boolean => isUtcIso(value),
      'Expected a UTC ISO datetime.',
    ),
});

const serializedClaimedEventSchema = z.discriminatedUnion('kind', [
  claimedBaseSchema
    .extend({
      kind: z.literal('fulfillment_demand_changed'),
      eventType: z.literal('fulfillment_demand_changed'),
      payload: fulfillmentDemandChangedV2PayloadSchema,
    })
    .strict(),
  claimedBaseSchema
    .extend({
      kind: z.literal('invalid'),
      eventType: z.string(),
      payload: jsonValueSchema,
      validationError: z.enum([
        'unsupported_event_type',
        'invalid_payload',
        'aggregate_mismatch',
      ]),
    })
    .strict(),
]);

const resultSchema = z.array(serializedClaimedEventSchema);

const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.literal('order_outbox_claim_invalid'),
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
): DecodeResult<ClaimOrderOutboxCommand> => {
  const parsed = commandSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

const toClaimedEvent = (
  value: z.infer<typeof serializedClaimedEventSchema>,
): ClaimedOrderOutboxEvent => {
  const base = {
    id: value.id,
    orderId: value.orderId,
    fulfillmentId: value.fulfillmentId,
    aggregateVersion: value.aggregateVersion,
    attempts: value.attempts,
    leaseOwner: value.leaseOwner,
    leaseExpiresAt: new Date(value.leaseExpiresAt),
  };
  if (value.kind === 'invalid')
    return {
      ...base,
      kind: value.kind,
      eventType: value.eventType,
      payload: value.payload,
      validationError: value.validationError,
    };
  return {
    ...base,
    kind: value.kind,
    eventType: value.eventType,
    payload: {
      ...value.payload,
      dueAt: new Date(value.payload.dueAt),
      observedAt: new Date(value.payload.observedAt),
    },
  };
};

const decodeResult = (
  serialized: unknown,
): DecodeResult<ClaimOrderOutboxResult> => {
  const parsed = resultSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(Object.freeze(parsed.data.map(toClaimedEvent)))
    : invalid(issues(parsed.error.issues));
};

const utc = (value: Date, code: string): string => {
  if (Number.isFinite(value.getTime())) return value.toISOString();
  throw invariantViolationError({
    code,
    message: 'An Order outbox event contains an invalid timestamp.',
    safeMessage: 'Order event data is inconsistent.',
  });
};

const serializeClaimedEvent = (
  value: ClaimedOrderOutboxEvent,
): z.input<typeof serializedClaimedEventSchema> => {
  const base = {
    id: value.id,
    orderId: value.orderId,
    fulfillmentId: value.fulfillmentId,
    aggregateVersion: value.aggregateVersion,
    attempts: value.attempts,
    leaseOwner: value.leaseOwner,
    leaseExpiresAt: utc(
      value.leaseExpiresAt,
      'orders_claimed_outbox_lease_timestamp_invalid',
    ),
  };
  if (value.kind === 'invalid')
    return {
      ...base,
      kind: value.kind,
      eventType: value.eventType,
      payload: value.payload,
      validationError: value.validationError,
    };
  return {
    ...base,
    kind: value.kind,
    eventType: value.eventType,
    payload: {
      ...value.payload,
      dueAt: utc(
        value.payload.dueAt,
        'orders_claimed_outbox_due_timestamp_invalid',
      ),
      observedAt: utc(
        value.payload.observedAt,
        'orders_claimed_outbox_observed_timestamp_invalid',
      ),
    },
  };
};

const encodeResult = (value: ClaimOrderOutboxResult): unknown => {
  const parsed = resultSchema.safeParse(value.map(serializeClaimedEvent));
  if (parsed.success) return parsed.data;
  throw invariantViolationError({
    code: 'orders_claim_outbox_result_invalid',
    message: 'A claim Order outbox result violated its boundary contract.',
    safeMessage: 'Order event data is inconsistent.',
    cause: parsed.error,
  });
};

const decodeFailure = (
  serialized: unknown,
): DecodeResult<ClaimOrderOutboxExpectedFailure> => {
  const parsed = failureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : invalid(issues(parsed.error.issues));
};

export const claimOrderOutboxContract = defineCellContract<
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxResult,
  ClaimOrderOutboxExpectedFailure
>({
  input: defineBoundaryContract({
    version: 1,
    decode: decodeCommand,
    encode: (command) => ({ ...command }),
  }),
  output: defineBoundaryContract({
    version: 2,
    decode: decodeResult,
    encode: encodeResult,
  }),
  failure: defineBoundaryContract({
    version: 1,
    decode: decodeFailure,
    encode: (failure) => ({ ...failure }),
  }),
});
