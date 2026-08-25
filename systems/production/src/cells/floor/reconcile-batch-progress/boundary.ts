import { z } from 'zod';

import {
  productionHashSchema,
  productionIdSchema,
  productionStageKindSchema,
} from '../../../read-models/production-order/contract.ts';

const productionRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();
export const productionBatchProgressReconciliationParamsSchema =
  productionRunParamsSchema
    .extend({ productionBatchId: productionIdSchema })
    .strict();

export const productionFloorMilestoneSchema = z.enum([
  'waiting_to_sort',
  'sorting_started',
  'sorting_completed',
  'washing_started',
  'washing_completed',
  'drying_started',
  'drying_completed',
  'folding_packaging_started',
  'finished',
]);

export const productionFloorProgressTargetSchema = z.enum([
  'sorting_started',
  'sorting_completed',
  'washing_started',
  'washing_completed',
  'drying_started',
  'drying_completed',
  'folding_packaging_started',
  'finished',
]);

export const productionFloorProgressReasonSchema = z.enum([
  'lpms_unavailable',
  'updates_missed',
  'other',
]);

export const productionExpectedStageVersionSchema = z
  .object({
    stageRunId: productionIdSchema,
    version: z.number().int().positive(),
  })
  .strict();

export const productionBatchProgressReconciliationConfirmationSchema = z
  .object({ proposalHash: productionHashSchema })
  .strict();

const reconcileProductionBatchProgressFields = {
  locationId: z.string().min(1),
  productionRunId: productionIdSchema,
  productionBatchId: productionIdSchema,
  expectedQueueVersion: z.number().int().positive(),
  expectedBatchVersion: z.number().int().positive(),
  expectedStageVersions: z
    .array(productionExpectedStageVersionSchema)
    .length(4),
  target: productionFloorProgressTargetSchema,
  reason: productionFloorProgressReasonSchema,
  note: z.string().trim().min(1).max(500).optional(),
  machineIds: z.array(productionIdSchema),
  confirmation:
    productionBatchProgressReconciliationConfirmationSchema.optional(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

const validateReconcileProductionBatchProgress = (
  command: {
    target: z.infer<typeof productionFloorProgressTargetSchema>;
    reason: z.infer<typeof productionFloorProgressReasonSchema>;
    note?: string | undefined;
    machineIds: readonly string[];
    expectedStageVersions: readonly Readonly<{ stageRunId: string }>[];
  },
  context: z.RefinementCtx,
): void => {
  if (
    new Set(command.expectedStageVersions.map((stage) => stage.stageRunId))
      .size !== command.expectedStageVersions.length
  )
    context.addIssue({
      code: 'custom',
      path: ['expectedStageVersions'],
      message: 'Expected stage versions must identify four distinct stages.',
    });

  if (new Set(command.machineIds).size !== command.machineIds.length)
    context.addIssue({
      code: 'custom',
      path: ['machineIds'],
      message: 'Machine identifiers must be distinct.',
    });

  const targetNeedsMachines =
    command.target === 'washing_started' || command.target === 'drying_started';
  if (targetNeedsMachines !== command.machineIds.length > 0)
    context.addIssue({
      code: 'custom',
      path: ['machineIds'],
      message: targetNeedsMachines
        ? 'An active washing or drying milestone requires machines.'
        : 'Only an active washing or drying milestone accepts machines.',
    });

  if (command.reason === 'other' && command.note === undefined)
    context.addIssue({
      code: 'custom',
      path: ['note'],
      message: 'An explanatory note is required for the other reason.',
    });
};

export const reconcileProductionBatchProgressCommandSchema = z
  .object(reconcileProductionBatchProgressFields)
  .strict()
  .superRefine(validateReconcileProductionBatchProgress);

export const reconcileProductionBatchProgressRequestSchema = z
  .object({
    expectedQueueVersion:
      reconcileProductionBatchProgressFields.expectedQueueVersion,
    expectedBatchVersion:
      reconcileProductionBatchProgressFields.expectedBatchVersion,
    expectedStageVersions:
      reconcileProductionBatchProgressFields.expectedStageVersions,
    target: reconcileProductionBatchProgressFields.target,
    reason: reconcileProductionBatchProgressFields.reason,
    note: reconcileProductionBatchProgressFields.note,
    machineIds: reconcileProductionBatchProgressFields.machineIds,
    confirmation: reconcileProductionBatchProgressFields.confirmation,
    idempotencyKey: reconcileProductionBatchProgressFields.idempotencyKey,
  })
  .strict()
  .superRefine(validateReconcileProductionBatchProgress);

export const productionBatchProgressReconciliationEffectsSchema = z
  .object({
    completedStages: z.array(productionStageKindSchema),
    activeStage: productionStageKindSchema.nullable(),
    finishesBatch: z.boolean(),
    finishesRun: z.boolean(),
    closesShift: z.boolean(),
  })
  .strict();

export const productionBatchProgressReconciliationConfirmationRequiredResultSchema =
  z
    .object({
      status: z.literal('confirmation_required'),
      productionRunId: productionIdSchema,
      productionBatchId: productionIdSchema,
      currentMilestone: productionFloorMilestoneSchema,
      targetMilestone: productionFloorProgressTargetSchema,
      queueVersion: z.number().int().positive(),
      batchVersion: z.number().int().positive(),
      stageVersions: z.array(productionExpectedStageVersionSchema).length(4),
      confirmation: productionBatchProgressReconciliationConfirmationSchema,
      effects: productionBatchProgressReconciliationEffectsSchema,
      replayed: z.literal(false),
    })
    .strict();

export const productionBatchProgressReconciledResultSchema = z
  .object({
    status: z.literal('reconciled'),
    productionRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    milestone: productionFloorProgressTargetSchema,
    queueVersion: z.number().int().positive(),
    batchVersion: z.number().int().positive(),
    stageVersions: z.array(productionExpectedStageVersionSchema).length(4),
    finishedOrderCount: z.number().int().nonnegative(),
    finishedBagCount: z.number().int().nonnegative(),
    runCompleted: z.boolean(),
    shiftClosed: z.boolean(),
    replayed: z.boolean(),
  })
  .strict();

export const productionBatchProgressReconciliationResultSchema = z.union([
  productionBatchProgressReconciliationConfirmationRequiredResultSchema,
  productionBatchProgressReconciledResultSchema,
]);

export type ReconcileProductionBatchProgressCommand = z.infer<
  typeof reconcileProductionBatchProgressCommandSchema
>;
export type ProductionFloorMilestone = z.infer<
  typeof productionFloorMilestoneSchema
>;
export type ProductionFloorProgressTarget = z.infer<
  typeof productionFloorProgressTargetSchema
>;
export type ProductionFloorProgressReason = z.infer<
  typeof productionFloorProgressReasonSchema
>;
export type ProductionBatchProgressReconciliationConfirmationRequiredResult =
  z.infer<
    typeof productionBatchProgressReconciliationConfirmationRequiredResultSchema
  >;
export type ProductionBatchProgressReconciliationResult = z.infer<
  typeof productionBatchProgressReconciliationResultSchema
>;
