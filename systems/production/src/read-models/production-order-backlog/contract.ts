import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionHashSchema,
  productionIdSchema,
  productionOrderResolutionReasonSchema,
  productionOrderResolutionStateSchema,
} from '../production-order/contract.ts';

export const productionOrderBacklogMaximumPreviewSize = 250;

export const productionOrderBacklogCursorSchema = z
  .string()
  .min(16)
  .max(2_048)
  .brand<'ProductionOrderBacklogCursor'>();

export const productionOrderBacklogFilterSchema = z.literal(
  'all_due_before_cutoff',
);

export const productionOrderBacklogCategorySchema = z.enum([
  'ready_to_archive',
  'review_individually',
  'kept_for_safety',
  'already_historical',
]);

export const productionOrderBacklogClassificationReasonSchema = z.enum([
  'resolved_without_production',
  'execution_finished',
  'execution_state_invalid',
  'resolution_transition_invalid',
  'execution_committed',
  'selected_for_shift',
  'batch_membership_exists',
  'stage_attempt_exists',
  'route_exists',
  'intake_recorded',
  'manual_admission',
  'priority',
  'pending_placement',
  'no_operator_owned_facts',
]);

const productionOrderBacklogScopeFields = {
  filter: productionOrderBacklogFilterSchema,
  cutoff: utcIsoStringSchema,
  reason: productionOrderResolutionReasonSchema,
  cursor: productionOrderBacklogCursorSchema.nullable().default(null),
  maxOrders: z
    .number()
    .int()
    .min(1)
    .max(productionOrderBacklogMaximumPreviewSize)
    .default(productionOrderBacklogMaximumPreviewSize),
} as const;

export const previewProductionOrderBacklogCommandSchema = z
  .object({
    locationId: z.string().min(1),
    ...productionOrderBacklogScopeFields,
  })
  .strict();

export const previewProductionOrderBacklogRequestSchema =
  previewProductionOrderBacklogCommandSchema.omit({ locationId: true });

export const productionOrderBacklogPreviewItemSchema = z
  .object({
    orderId: productionIdSchema,
    displayReference: z.string().min(1),
    dueAt: utcIsoStringSchema,
    category: productionOrderBacklogCategorySchema,
    reasons: z.array(productionOrderBacklogClassificationReasonSchema).min(1),
    expectedVersion: z.number().int().positive(),
    expectedResolutionState: productionOrderResolutionStateSchema,
  })
  .strict();

const productionOrderBacklogPreviewGroupsSchema = z
  .object({
    readyToArchive: z.array(productionOrderBacklogPreviewItemSchema),
    reviewIndividually: z.array(productionOrderBacklogPreviewItemSchema),
    keptForSafety: z.array(productionOrderBacklogPreviewItemSchema),
    alreadyHistorical: z.array(productionOrderBacklogPreviewItemSchema),
  })
  .strict();

export const productionOrderBacklogPreviewSchema = z
  .object({
    locationId: z.string().min(1),
    filter: productionOrderBacklogFilterSchema,
    cutoff: utcIsoStringSchema,
    reason: productionOrderResolutionReasonSchema,
    maxOrders: z
      .number()
      .int()
      .min(1)
      .max(productionOrderBacklogMaximumPreviewSize),
    candidateCount: z
      .number()
      .int()
      .min(0)
      .max(productionOrderBacklogMaximumPreviewSize),
    hasMore: z.boolean(),
    cursor: productionOrderBacklogCursorSchema.nullable().default(null),
    nextCursor: productionOrderBacklogCursorSchema.nullable().default(null),
    previewHash: productionHashSchema,
    generatedAt: utcIsoStringSchema,
    groups: productionOrderBacklogPreviewGroupsSchema,
  })
  .strict()
  .superRefine((preview, context) => {
    const grouped = [
      ['readyToArchive', 'ready_to_archive'],
      ['reviewIndividually', 'review_individually'],
      ['keptForSafety', 'kept_for_safety'],
      ['alreadyHistorical', 'already_historical'],
    ] as const;
    const actualCount = grouped.reduce(
      (count, [key]) => count + preview.groups[key].length,
      0,
    );

    if (actualCount !== preview.candidateCount)
      context.addIssue({
        code: 'custom',
        path: ['candidateCount'],
        message: 'Candidate count must equal the four server-owned groups.',
      });

    if (preview.hasMore !== (preview.nextCursor !== null))
      context.addIssue({
        code: 'custom',
        path: ['nextCursor'],
        message:
          'A next cursor must be present exactly when another page exists.',
      });

    for (const [key, category] of grouped)
      preview.groups[key].forEach((item, index) => {
        if (item.category !== category)
          context.addIssue({
            code: 'custom',
            path: ['groups', key, index, 'category'],
            message: `Items in ${key} must use category ${category}.`,
          });
      });
  });

const productionOrderBacklogNoteSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .nullable()
  .default(null);

const productionOrderBacklogCommitFields = {
  ...productionOrderBacklogScopeFields,
  note: productionOrderBacklogNoteSchema,
  previewHash: productionHashSchema,
  idempotencyKey: z.string().min(8).max(200),
} as const;

const requireBacklogOtherNote = (
  value: Readonly<{ reason: string; note: string | null }>,
  context: z.RefinementCtx,
): void => {
  if (value.reason === 'other' && value.note === null)
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'An explanatory note is required for the other reason.',
    });
};

export const commitProductionOrderBacklogCommandSchema = z
  .object({
    locationId: z.string().min(1),
    ...productionOrderBacklogCommitFields,
  })
  .strict()
  .superRefine(requireBacklogOtherNote);

export const commitProductionOrderBacklogRequestSchema = z
  .object(productionOrderBacklogCommitFields)
  .strict()
  .superRefine(requireBacklogOtherNote);

export const productionOrderBacklogResolvedItemSchema = z
  .object({
    orderId: productionIdSchema,
    resolutionState: z.literal('resolved_without_production'),
    version: z.number().int().positive(),
  })
  .strict();

export const productionOrderBacklogCommitResultSchema = z
  .object({
    locationId: z.string().min(1),
    bulkOperationId: productionIdSchema,
    previewHash: productionHashSchema,
    nextCursor: productionOrderBacklogCursorSchema.nullable().default(null),
    resolvedCount: z.number().int().min(0),
    resolved: z.array(productionOrderBacklogResolvedItemSchema),
    committedAt: utcIsoStringSchema,
    replayed: z.boolean(),
  })
  .strict()
  .superRefine((commit, context) => {
    if (commit.resolvedCount !== commit.resolved.length)
      context.addIssue({
        code: 'custom',
        path: ['resolvedCount'],
        message: 'Resolved count must equal the resolved-order results.',
      });
  });

export type ProductionOrderBacklogFilter = z.infer<
  typeof productionOrderBacklogFilterSchema
>;
export type ProductionOrderBacklogCursor = z.infer<
  typeof productionOrderBacklogCursorSchema
>;
export type ProductionOrderBacklogCategory = z.infer<
  typeof productionOrderBacklogCategorySchema
>;
export type ProductionOrderBacklogClassificationReason = z.infer<
  typeof productionOrderBacklogClassificationReasonSchema
>;
export type PreviewProductionOrderBacklogCommand = z.infer<
  typeof previewProductionOrderBacklogCommandSchema
>;
export type ProductionOrderBacklogPreviewItem = z.infer<
  typeof productionOrderBacklogPreviewItemSchema
>;
export type ProductionOrderBacklogPreview = z.infer<
  typeof productionOrderBacklogPreviewSchema
>;
export type CommitProductionOrderBacklogCommand = z.infer<
  typeof commitProductionOrderBacklogCommandSchema
>;
export type ProductionOrderBacklogCommitResult = z.infer<
  typeof productionOrderBacklogCommitResultSchema
>;
