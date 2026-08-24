import { decode, type DecodeResult } from '@pressly/cells';
import { z } from 'zod';
import {
  invalidPricingContractOutput,
  pricingContractIssues,
} from './contract.ts';
import type {
  PricingChangeCommand,
  PricingChangeFailure,
  PricingChangePlan,
  PricingChangePolicyFailure,
  PricingChangeReadFailure,
  PublishedPricingChange,
} from './pricing-change.ts';

export const pricingChangeRequestSchema = z
  .object({
    serviceSlug: z.enum(['wash-fold', 'dry-cleaning']),
    reason: z.string().min(1),
    items: z
      .array(
        z
          .object({
            code: z.string().min(1),
            priceCents: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

const authorSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['human', 'service']),
    displayName: z.string().min(1),
  })
  .strict();

const commandSchema = pricingChangeRequestSchema
  .extend({ requestedBy: authorSchema })
  .strict();

const planSchema = z
  .object({
    serviceSlug: z.enum(['wash-fold', 'dry-cleaning']),
    reason: z.string().min(1),
    oldPricingSetId: z.string().min(1),
    currency: z.string().min(1),
    changes: z.array(
      z
        .object({
          code: z.string().min(1),
          name: z.string().min(1),
          oldPriceCents: z.number().int().nonnegative(),
          newPriceCents: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();

const publishedSchema = z
  .object({
    oldPricingSetId: z.string().min(1),
    newPricingSetId: z.string().min(1),
    auditEventId: z.string().min(1),
    changeItemCount: z.number().int().nonnegative(),
  })
  .strict();

const violationSchema = z.discriminatedUnion('code', [
  z
    .object({
      code: z.literal('pricing_change_reason_too_short'),
      minimumLength: z.number().int(),
      actualLength: z.number().int(),
    })
    .strict(),
  z
    .object({
      code: z.literal('duplicate_pricing_item_code'),
      itemCode: z.string(),
    })
    .strict(),
  z
    .object({
      code: z.literal('invalid_pricing_item_price'),
      itemCode: z.string(),
      priceCents: z.number(),
    })
    .strict(),
  z
    .object({
      code: z.literal('pricing_item_code_not_found'),
      itemCode: z.string(),
    })
    .strict(),
  z.object({ code: z.literal('pricing_change_has_no_changes') }).strict(),
]);

const policyFailureSchema = z
  .object({
    code: z.enum([
      'pricing_change_reason_too_short',
      'duplicate_pricing_item_code',
      'invalid_pricing_item_price',
      'pricing_item_code_not_found',
      'pricing_change_has_no_changes',
    ]),
    violations: z.array(violationSchema).nonempty(),
  })
  .strict()
  .refine((value) => value.code === value.violations[0]?.code);

const readFailureSchemas = [
  z
    .object({
      code: z.literal('pricing_service_not_found'),
      serviceSlug: z.enum(['wash-fold', 'dry-cleaning']),
    })
    .strict(),
  z
    .object({
      code: z.literal('active_pricing_set_not_found'),
      serviceSlug: z.enum(['wash-fold', 'dry-cleaning']),
    })
    .strict(),
  z
    .object({
      code: z.literal('multiple_active_pricing_sets'),
      serviceSlug: z.enum(['wash-fold', 'dry-cleaning']),
    })
    .strict(),
  z
    .object({
      code: z.literal('active_pricing_set_has_no_items'),
      pricingSetId: z.string(),
    })
    .strict(),
] as const;

const planPricingChangeFailureSchema = z.union([
  policyFailureSchema,
  ...readFailureSchemas,
]);

const publishPricingChangeFailureSchema = z.union([
  policyFailureSchema,
  ...readFailureSchemas,
  z
    .object({
      code: z.literal('pricing_state_changed'),
      expectedPricingSetId: z.string(),
      actualPricingSetId: z.string(),
    })
    .strict(),
]);

export const decodePricingChangeCommand = (
  serialized: unknown,
): DecodeResult<PricingChangeCommand> => {
  const parsed = commandSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid({
        ...parsed.data,
        items: parsed.data.items.map((item) => ({ ...item })),
        requestedBy: { ...parsed.data.requestedBy },
      })
    : decode.invalid(pricingContractIssues(parsed.error.issues));
};

export const decodePricingChangePlan = (
  serialized: unknown,
): DecodeResult<PricingChangePlan> => {
  const parsed = planSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid({
        ...parsed.data,
        changes: parsed.data.changes.map((change) => ({ ...change })),
      })
    : decode.invalid(pricingContractIssues(parsed.error.issues));
};

export const decodePublishedPricingChange = (
  serialized: unknown,
): DecodeResult<PublishedPricingChange> => {
  const parsed = publishedSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data)
    : decode.invalid(pricingContractIssues(parsed.error.issues));
};

export const decodePlanPricingChangeFailure = (
  serialized: unknown,
): DecodeResult<PricingChangePolicyFailure | PricingChangeReadFailure> => {
  const parsed = planPricingChangeFailureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(
        parsed.data as PricingChangePolicyFailure | PricingChangeReadFailure,
      )
    : decode.invalid(pricingContractIssues(parsed.error.issues));
};

export const decodePublishPricingChangeFailure = (
  serialized: unknown,
): DecodeResult<PricingChangeFailure> => {
  const parsed = publishPricingChangeFailureSchema.safeParse(serialized);
  return parsed.success
    ? decode.valid(parsed.data as PricingChangeFailure)
    : decode.invalid(pricingContractIssues(parsed.error.issues));
};

export const encodePricingChangeCommand = (command: PricingChangeCommand) => {
  const parsed = commandSchema.safeParse({
    serviceSlug: command.serviceSlug,
    reason: command.reason,
    items: command.items.map((item) => ({ ...item })),
    requestedBy: { ...command.requestedBy },
  });
  return parsed.success
    ? parsed.data
    : invalidPricingContractOutput(
        'pricing_change_command_invalid',
        'A pricing change command violated its contract.',
        parsed.error,
      );
};

export const encodePricingChangePlan = (plan: PricingChangePlan) => {
  const parsed = planSchema.safeParse({
    ...plan,
    changes: plan.changes.map((change) => ({ ...change })),
  });
  return parsed.success
    ? parsed.data
    : invalidPricingContractOutput(
        'pricing_change_plan_invalid',
        'A pricing change plan violated its contract.',
        parsed.error,
      );
};

export const encodePublishedPricingChange = (
  published: PublishedPricingChange,
) => {
  const parsed = publishedSchema.safeParse({ ...published });
  return parsed.success
    ? parsed.data
    : invalidPricingContractOutput(
        'published_pricing_change_invalid',
        'A published pricing change result violated its contract.',
        parsed.error,
      );
};

export const encodePricingChangeFailure = (failure: PricingChangeFailure) => {
  const serialized =
    'violations' in failure
      ? {
          ...failure,
          violations: (failure as PricingChangePolicyFailure).violations.map(
            (violation) => ({ ...violation }),
          ),
        }
      : { ...failure };
  const parsed = publishPricingChangeFailureSchema.safeParse(serialized);
  return parsed.success
    ? parsed.data
    : invalidPricingContractOutput(
        'pricing_change_failure_invalid',
        'A pricing change failure violated its contract.',
        parsed.error,
      );
};
