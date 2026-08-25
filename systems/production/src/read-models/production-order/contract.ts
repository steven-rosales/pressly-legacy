import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';
export const productionIdSchema = z.uuid();
export const productionHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const productionAlgorithmVersionSchema = z.enum([
  'fixed-pulse-ffd-v1',
  'fixed-pulse-ffd-v2',
]);
export const productionRunStatusSchema = z.enum([
  'planned',
  'started',
  'completed',
]);
export const productionBatchStatusSchema = z.enum([
  'queued',
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
  'finished',
]);
export const productionPlacementProvenanceSchema = z.enum([
  'initial_schedule',
  'automatic',
  'manager_exact',
  'manual_rebatch',
  'exception_route',
]);
export const productionPlacementModeSchema = z.enum([
  'automatic',
  'manager_exact',
]);
export const productionPlacementTargetSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('existing_batch'),
      productionBatchId: productionIdSchema,
      sequence: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('new_batch'),
      sequence: z.number().int().nonnegative(),
    })
    .strict(),
]);
export const productionPlacementFailureReasonSchema = z.enum([
  'hard_capacity_exceeded',
  'run_not_started',
  'run_completed',
  'order_not_eligible',
  'order_already_scheduled',
  'no_mutable_position',
  'queue_conflict',
  'proposal_stale',
]);
export const productionStageKindSchema = z.enum([
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
]);
export const productionDueBucketSchema = z.enum([
  'overdue',
  'today',
  'tomorrow',
  'later',
]);
export const productionOrderStatusSchema = z.enum([
  'release_pending',
  'intake_pending',
  'eligible',
  'ineligible',
  'scheduled',
  'finished',
]);
export const productionOrderResolutionStateSchema = z.enum([
  'open',
  'resolved_without_production',
]);
export const productionOrderResolutionReasonSchema = z.enum([
  'completed_outside_pressly',
  'processor_not_in_use',
  'duplicate_or_test',
  'order_will_not_be_produced',
  'other',
]);
export const productionOrderRestorationReasonSchema = z.enum([
  'manager_correction',
  'work_should_be_produced',
  'other',
]);
export const productionAdmissionTargetSchema = z.enum(['released', 'source']);
export const productionAdmissionOverrideSchema = z
  .literal('released')
  .nullable();
export const productionDemandPhaseSchema = z.enum([
  'expected',
  'inbound',
  'production_released',
  'post_production',
  'withdrawn',
]);
export const productionDemandReadinessSchema = z.enum([
  'awaiting_release',
  'awaiting_intake',
  'ready',
  'in_production',
  'finished',
  'not_admitted',
]);
export const productionBagCountProvenanceSchema = z.enum([
  'external_source',
  'operator_intake',
]);
export const productionWarningCodeSchema = z.enum([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

export const productionWarningSchema = z
  .object({
    code: productionWarningCodeSchema,
    message: z.string().min(1),
    blocking: z.boolean(),
    orderIds: z.array(productionIdSchema).optional(),
  })
  .strict();

export const productionOrderSummarySchema = z
  .object({
    id: productionIdSchema,
    externalOrderId: z.string().min(1),
    dueAt: utcIsoStringSchema,
    dueBucket: productionDueBucketSchema,
    priority: z.boolean(),
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative(),
    version: z.number().int().positive(),
  })
  .strict();

export const productionOrderListItemSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    externalOrderId: z.string().min(1),
    dueAt: utcIsoStringSchema,
    dueBucket: productionDueBucketSchema,
    priority: z.boolean(),
    status: productionOrderStatusSchema,
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative().nullable(),
    bagCountProvenance: productionBagCountProvenanceSchema.nullable(),
    intakeVersion: z.number().int().positive().nullable(),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((order, context) => {
    if ((order.bagCount === null) !== (order.bagCountProvenance === null))
      context.addIssue({
        code: 'custom',
        path: ['bagCountProvenance'],
        message:
          'Bag count and provenance must either both exist or both be null.',
      });

    if ((order.bagCount === null) !== (order.intakeVersion === null))
      context.addIssue({
        code: 'custom',
        path: ['intakeVersion'],
        message:
          'Bag count and intake version must either both exist or both be null.',
      });

    if (order.status === 'intake_pending' && order.bagCount !== null)
      context.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'An intake-pending order cannot have a recorded bag count.',
      });

    if (
      order.status !== 'release_pending' &&
      order.status !== 'intake_pending' &&
      order.status !== 'ineligible' &&
      order.bagCount === null
    )
      context.addIssue({
        code: 'custom',
        path: ['bagCount'],
        message: 'A schedulable or processed order requires bag intake.',
      });
  });

export type ProductionOrderSummary = z.infer<
  typeof productionOrderSummarySchema
>;
export type ProductionWarning = z.infer<typeof productionWarningSchema>;
export type ProductionOrderListItem = z.infer<
  typeof productionOrderListItemSchema
>;
