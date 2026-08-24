import {
  decode,
  defineBoundaryContract,
  defineMessageContract,
  type ContractIssue,
  type DecodeResult,
} from '@pressly/cells';
import { invariantViolationError } from '@pressly/errors/factories';
import { isUtcIso } from '@pressly/time';
import { z } from 'zod';

export const fulfillmentDemandChangedV2Type =
  'fulfillment_demand_changed' as const;

export const fulfillmentDemandChangedV2PayloadSchema = z
  .object({
    schemaVersion: z.literal(2),
    eventType: z.literal(fulfillmentDemandChangedV2Type),
    fulfillmentId: z.string().uuid(),
    displayNumber: z.string().min(1).nullable(),
    locationId: z.string().min(1),
    typeCode: z.string().min(1),
    admissionState: z.enum(['unreleased', 'released', 'withdrawn']),
    commercialState: z.enum(['open', 'completed', 'canceled']),
    dueAt: z
      .string()
      .refine(
        (value): boolean => isUtcIso(value),
        'Expected a UTC ISO datetime.',
      ),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
    version: z.number().int().positive(),
    observedAt: z
      .string()
      .refine(
        (value): boolean => isUtcIso(value),
        'Expected a UTC ISO datetime.',
      ),
  })
  .strict()
  .refine(
    (value) =>
      (value.estimatedWeightLbs === null) ===
      (value.estimatedWeightSource === null),
    {
      message: 'Weight and provenance must either both exist or both be null.',
    },
  );

export type SerializedFulfillmentDemandChangedV2 = z.infer<
  typeof fulfillmentDemandChangedV2PayloadSchema
>;

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

const decodePayload = (
  serialized: unknown,
): DecodeResult<SerializedFulfillmentDemandChangedV2> => {
  const parsed = fulfillmentDemandChangedV2PayloadSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(issues(parsed.error.issues));
};

const encodePayload = (
  payload: SerializedFulfillmentDemandChangedV2,
): unknown => {
  const parsed = fulfillmentDemandChangedV2PayloadSchema.safeParse(payload);
  if (parsed.success) return parsed.data;

  throw invariantViolationError({
    code: 'orders_fulfillment_demand_changed_payload_invalid',
    message:
      'An Orders fulfillment-demand event did not satisfy its serialized contract.',
    safeMessage: 'Order event data is inconsistent.',
    cause: parsed.error,
  });
};

export const fulfillmentDemandChangedV2MessageContract =
  defineMessageContract<SerializedFulfillmentDemandChangedV2>({
    type: fulfillmentDemandChangedV2Type,
    version: 2,
    scope: 'external',
    payload: defineBoundaryContract({
      version: 2,
      decode: decodePayload,
      encode: encodePayload,
    }),
  });
