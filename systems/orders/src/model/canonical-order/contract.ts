import { jsonObjectSchema } from '@pressly/codec/zod';
import {
  decode,
  defineBoundaryContract,
  defineCellContract,
  type ContractIssue,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { z } from 'zod';

export const utcDateSchema = z.iso
  .datetime()
  .transform((value) => new Date(value));

export const commandContextSchema = z
  .object({
    origin: z.string(),
    principal: z
      .object({
        kind: z.enum(['human', 'service', 'system']),
        id: z.string(),
      })
      .strict(),
  })
  .strict();

export const orderCustomerSchema = z.discriminatedUnion('resolution', [
  z
    .object({
      resolution: z.literal('resolved'),
      userId: z.string(),
      externalUserId: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      resolution: z.literal('not_provided'),
      userId: z.null(),
      externalUserId: z.null(),
    })
    .strict(),
  z
    .object({
      resolution: z.enum(['pending', 'conflict']),
      userId: z.null(),
      externalUserId: z.string(),
    })
    .strict(),
]);

export const orderItemSchema = z
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

export const directFulfillmentSchema = z
  .object({
    typeCode: z.string(),
    locationId: z.string(),
    estimatedWeightLbs: z.number().nullable(),
    estimatedWeightSource: z.string().nullable(),
  })
  .strict();

export const auditedCommandSchema = {
  businessId: z.string(),
  idempotencyKey: z.string(),
  context: commandContextSchema,
  reasonNote: z.string().nullable(),
} as const;

export const orderMutationResultSchema = z
  .object({
    orderId: z.string(),
    fulfillmentId: z.string(),
    version: z.number().int(),
    replayed: z.boolean(),
  })
  .strict();

export const canonicalOrderSummarySchema = z
  .object({
    orderId: z.string(),
    businessId: z.string(),
    orderVersion: z.number().int(),
    fulfillmentId: z.string(),
    fulfillmentVersion: z.number().int(),
    displayNumber: z.string().nullable(),
    state: z.enum(['open', 'completed', 'canceled']),
    dueAt: utcDateSchema,
    currency: z.string(),
    totalAmountCents: z.number().int(),
    balanceDueCents: z.number().int().nullable(),
    customer: z
      .object({
        resolution: z.enum(['resolved', 'not_provided', 'pending', 'conflict']),
        userId: z.string().nullable(),
        displayName: z.string().nullable(),
        phone: z.string().nullable(),
        email: z.string().nullable(),
      })
      .strict(),
    fulfillment: z
      .object({
        typeCode: z.string(),
        locationId: z.string(),
        releaseState: z.enum(['unreleased', 'released', 'withdrawn']),
        estimatedWeightLbs: z.number().nullable(),
        estimatedWeightSource: z.string().nullable(),
      })
      .strict(),
    createdAt: utcDateSchema,
    updatedAt: utcDateSchema,
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

const serialize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, serialize(item)]),
  );
};

export const defineStrictCellContract = <Input, Output, Failure>(input: {
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  failureSchema: z.ZodType;
  invariantCode: string;
}) => {
  const boundary = <Value>(schema: z.ZodType, code: string) =>
    defineBoundaryContract<Value>({
      version: 1,
      decode: (serialized) => {
        const parsed = schema.safeParse(serialized);
        return parsed.success
          ? decode.valid(parsed.data as Value)
          : decode.invalid(issues(parsed.error.issues));
      },
      encode: (value) => {
        const serialized = serialize(value);
        const parsed = schema.safeParse(serialized);
        if (parsed.success) return serialized;
        throw invariantViolationError({
          code,
          message: 'An Orders cell value violated its boundary contract.',
          safeMessage: 'Order data is inconsistent.',
          cause: parsed.error,
        });
      },
    });

  return defineCellContract<Input, Output, Failure>({
    input: boundary<Input>(input.inputSchema, `${input.invariantCode}_input`),
    output: boundary<Output>(
      input.outputSchema,
      `${input.invariantCode}_output`,
    ),
    failure: boundary<Failure>(
      input.failureSchema,
      `${input.invariantCode}_failure`,
    ),
  });
};
