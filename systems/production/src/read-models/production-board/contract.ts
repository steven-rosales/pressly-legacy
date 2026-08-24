import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionBatchStatusSchema,
  productionDemandPhaseSchema,
  productionDemandReadinessSchema,
  productionHashSchema,
  productionIdSchema,
  productionOrderListItemSchema,
  productionOrderStatusSchema,
  productionOrderSummarySchema,
  productionPlacementFailureReasonSchema,
  productionPlacementModeSchema,
  productionPlacementProvenanceSchema,
  productionPlacementTargetSchema,
  productionRunStatusSchema,
  productionStageKindSchema,
} from '../production-order/contract.ts';
import {
  productionLocationSchema,
  productionMachineSchema,
  productionStationSchema,
} from '../production-resources/contract.ts';
import {
  productionShiftSchema,
  productionShiftSelectionSchema,
  scheduleProposalSchema,
  schedulerConfigSchema,
} from '../production-schedule/contract.ts';
export const productionStageActionBlockCodeSchema = z.enum([
  'PRODUCTION_RUN_NOT_STARTED',
  'PREVIOUS_STAGE_INCOMPLETE',
  'STAGE_KIND_ALREADY_ACTIVE',
  'MACHINE_ASSIGNMENT_REQUIRED',
  'MACHINE_ASSIGNMENT_OVERLAPS',
]);

export const productionStageBoundaryProvenanceSchema = z.enum([
  'live_observed',
  'operator_reported',
  'not_recorded',
]);

export const productionStageStartTimingSchema = z
  .object({
    plannedStartAt: utcIsoStringSchema,
    plannedEndAt: utcIsoStringSchema,
    observedAt: utcIsoStringSchema,
    remainingMilliseconds: z.number().int().positive(),
  })
  .strict();

export const productionStageCompletionTimingSchema = z
  .object({
    actualStartAt: utcIsoStringSchema,
    plannedEndAt: utcIsoStringSchema,
    completionBoundaryAt: utcIsoStringSchema,
    observedAt: utcIsoStringSchema,
    plannedDurationMilliseconds: z.number().int().positive(),
    elapsedMilliseconds: z.number().int().nonnegative(),
    remainingMilliseconds: z.number().int().positive(),
  })
  .strict();

export const productionStageTimingConfirmationSchema = z
  .object({
    observedAt: utcIsoStringSchema,
    confirmationHash: productionHashSchema,
  })
  .strict();

export const productionStageNextActionSchema = z.union([
  z
    .object({
      state: z.literal('available'),
      action: z.enum(['start', 'complete']),
    })
    .strict(),
  z
    .object({
      state: z.literal('blocked'),
      action: z.enum(['start', 'complete']),
      code: productionStageActionBlockCodeSchema,
      message: z.string().min(1),
      availableAt: utcIsoStringSchema.nullable(),
    })
    .strict(),
  z
    .object({
      state: z.literal('confirmation_required'),
      action: z.literal('start'),
      code: z.literal('PLANNED_START_NOT_REACHED'),
      message: z.string().min(1),
      availableAt: utcIsoStringSchema,
      timing: productionStageStartTimingSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal('confirmation_required'),
      action: z.literal('complete'),
      code: z.literal('PULSE_BOUNDARY_NOT_REACHED'),
      message: z.string().min(1),
      availableAt: utcIsoStringSchema,
      timing: productionStageCompletionTimingSchema,
    })
    .strict(),
  z
    .object({
      state: z.literal('terminal'),
      reason: z.literal('stage_completed'),
    })
    .strict(),
]);

export const stageRunSchema = z
  .object({
    id: productionIdSchema,
    productionBatchId: productionIdSchema,
    stage: productionStageKindSchema,
    status: z.enum(['planned', 'started', 'completed']),
    plannedStartAt: utcIsoStringSchema,
    plannedEndAt: utcIsoStringSchema,
    actualStartAt: utcIsoStringSchema.nullable(),
    actualEndAt: utcIsoStringSchema.nullable(),
    actualStartProvenance: productionStageBoundaryProvenanceSchema,
    actualEndProvenance: productionStageBoundaryProvenanceSchema,
    machineIds: z.array(productionIdSchema),
    nextAction: productionStageNextActionSchema,
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((stage, context) => {
    if (
      (stage.actualStartAt === null) !==
      (stage.actualStartProvenance === 'not_recorded')
    )
      context.addIssue({
        code: 'custom',
        path: ['actualStartProvenance'],
        message: 'Actual start time and provenance disagree.',
      });
    if (
      (stage.actualEndAt === null) !==
      (stage.actualEndProvenance === 'not_recorded')
    )
      context.addIssue({
        code: 'custom',
        path: ['actualEndProvenance'],
        message: 'Actual end time and provenance disagree.',
      });
  });

export const productionBatchMembershipSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('mutable') }).strict(),
  z
    .object({
      state: z.literal('frozen'),
      frozenAt: utcIsoStringSchema,
      frozenBy: productionIdSchema,
    })
    .strict(),
]);

export const productionBatchOrderSchema = productionOrderSummarySchema
  .extend({
    placementProvenance: productionPlacementProvenanceSchema,
    pinnedAt: utcIsoStringSchema.nullable(),
    pinnedBy: productionIdSchema.nullable(),
  })
  .strict()
  .superRefine((order, context) => {
    if ((order.pinnedAt === null) !== (order.pinnedBy === null))
      context.addIssue({
        code: 'custom',
        path: ['pinnedBy'],
        message:
          'Pinned-at and pinned-by must either both exist or both be null.',
      });

    const isPinnedPlacement =
      order.placementProvenance === 'manager_exact' ||
      order.placementProvenance === 'manual_rebatch';
    if (isPinnedPlacement !== (order.pinnedAt !== null))
      context.addIssue({
        code: 'custom',
        path: ['placementProvenance'],
        message: 'Only exact or manual queued placement is pinned.',
      });
  });

export const productionBatchSchema = z
  .object({
    id: productionIdSchema,
    sequence: z.number().int().nonnegative(),
    status: productionBatchStatusSchema,
    derivedWeightLbs: z.number().positive(),
    pulseCapacityLbs: z.number().positive(),
    pulseMinutes: z.number().int().positive(),
    membership: productionBatchMembershipSchema,
    orders: z.array(productionBatchOrderSchema).min(1),
    stages: z.array(stageRunSchema).length(4),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((batch, context) => {
    if (batch.status !== 'queued' && batch.membership.state !== 'frozen')
      context.addIssue({
        code: 'custom',
        path: ['membership'],
        message: 'A non-queued batch must have frozen membership.',
      });
  });

export const productionOvertimeAcknowledgementSchema = z
  .object({
    proposalHash: productionHashSchema,
    queueVersion: z.number().int().positive(),
    acknowledgedBy: productionIdSchema,
    acknowledgedAt: utcIsoStringSchema,
  })
  .strict();

export const productionRunSummarySchema = z
  .object({
    id: productionIdSchema,
    productionShiftId: productionIdSchema,
    status: productionRunStatusSchema,
    queueVersion: z.number().int().positive(),
    plannedCompletionAt: utcIsoStringSchema,
    overtimeAcknowledgement: productionOvertimeAcknowledgementSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const productionPlacementPreviewSchema = z
  .object({
    target: productionPlacementTargetSchema,
    affectedBatchIds: z.array(productionIdSchema),
    queueVersion: z.number().int().positive(),
    proposalHash: productionHashSchema,
    projectedCompletionAt: utcIsoStringSchema,
    overtimeMinutes: z.number().int().nonnegative(),
  })
  .strict();

export const productionPendingPlacementSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('awaiting_run'),
      reason: z.enum(['no_started_run', 'automatic_placement_not_attempted']),
      message: z.string().min(1),
    })
    .strict(),
  z
    .object({
      status: z.literal('ambiguous_run'),
      reason: z.literal('multiple_started_runs'),
      message: z.string().min(1),
      candidateProductionRunIds: z.array(productionIdSchema).min(2),
    })
    .strict(),
  z
    .object({
      status: z.literal('confirmation_required'),
      mode: productionPlacementModeSchema,
      productionRunId: productionIdSchema,
      target: productionPlacementTargetSchema,
      affectedBatchIds: z.array(productionIdSchema),
      queueVersion: z.number().int().positive(),
      proposalHash: productionHashSchema,
      projectedCompletionAt: utcIsoStringSchema,
      overtimeMinutes: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      status: z.literal('not_placed'),
      mode: productionPlacementModeSchema,
      productionRunId: productionIdSchema,
      reason: productionPlacementFailureReasonSchema,
      message: z.string().min(1),
      queueVersion: z.number().int().positive(),
      preview: productionPlacementPreviewSchema.nullable(),
    })
    .strict(),
]);

export const productionPendingOrderSchema = productionOrderSummarySchema
  .extend({ placement: productionPendingPlacementSchema })
  .strict();

export const productionLivePlacementCapacitySchema = z
  .object({
    beforeLbs: z.number().nonnegative(),
    afterLbs: z.number().positive(),
    limitLbs: z.number().positive(),
  })
  .strict()
  .superRefine((capacity, context) => {
    if (capacity.afterLbs > capacity.limitLbs)
      context.addIssue({
        code: 'custom',
        path: ['afterLbs'],
        message: 'An authorized placement cannot exceed pulse capacity.',
      });
  });

const productionLivePlacementProjectionFields = {
  proposalHash: productionHashSchema,
  expectedQueueVersion: z.number().int().positive(),
  expectedOrderVersion: z.number().int().positive(),
  capacity: productionLivePlacementCapacitySchema,
  projectedCompletionAt: utcIsoStringSchema,
  overtime: z
    .object({
      required: z.boolean(),
      minutes: z.number().int().nonnegative(),
      shiftEndsAt: utcIsoStringSchema,
    })
    .strict(),
} as const;

export const productionLiveAutomaticPlacementSchema = z
  .object({
    mode: z.literal('automatic'),
    target: productionPlacementTargetSchema,
    expectedBatchVersion: z.number().int().positive().nullable(),
    allowedActions: z
      .array(z.enum(['place_automatically', 'confirm_overtime']))
      .length(1),
    ...productionLivePlacementProjectionFields,
  })
  .strict()
  .superRefine((placement, context) => {
    const targetsExistingBatch = placement.target.kind === 'existing_batch';
    if (targetsExistingBatch !== (placement.expectedBatchVersion !== null))
      context.addIssue({
        code: 'custom',
        path: ['expectedBatchVersion'],
        message: 'Existing-batch placement requires the current batch version.',
      });
    if (
      placement.allowedActions[0] === 'confirm_overtime' &&
      !placement.overtime.required
    )
      context.addIssue({
        code: 'custom',
        path: ['allowedActions'],
        message: 'Overtime confirmation requires an overtime projection.',
      });
  });

export const productionLiveExactBatchTargetSchema = z
  .object({
    mode: z.literal('manager_exact'),
    target: z
      .object({
        kind: z.literal('existing_batch'),
        productionBatchId: productionIdSchema,
        sequence: z.number().int().nonnegative(),
      })
      .strict(),
    expectedBatchVersion: z.number().int().positive(),
    allowedActions: z
      .array(z.enum(['place_exactly', 'confirm_overtime']))
      .length(1),
    ...productionLivePlacementProjectionFields,
  })
  .strict()
  .superRefine((placement, context) => {
    if (
      placement.allowedActions[0] === 'confirm_overtime' &&
      !placement.overtime.required
    )
      context.addIssue({
        code: 'custom',
        path: ['allowedActions'],
        message: 'Overtime confirmation requires an overtime projection.',
      });
  });

export const productionLiveRecommendedPlacementSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('available'),
        placement: productionLiveAutomaticPlacementSchema,
      })
      .strict(),
    z
      .object({
        status: z.literal('unavailable'),
        reason: productionPlacementFailureReasonSchema,
        message: z.string().min(1),
      })
      .strict(),
  ],
);

export const productionLiveRunChangeOrderSchema = productionPendingOrderSchema
  .extend({
    recommendedPlacement: productionLiveRecommendedPlacementSchema,
    exactBatchTargets: z.array(productionLiveExactBatchTargetSchema),
  })
  .strict();

export const productionLiveRunChangesSchema = z
  .object({
    productionRunId: productionIdSchema,
    queueVersion: z.number().int().positive(),
    pulseCapacityLbs: z.number().positive(),
    orders: z.array(productionLiveRunChangeOrderSchema),
  })
  .strict();

export const productionBoardSchema = z
  .object({
    productionShift: productionShiftSchema,
    productionRun: productionRunSummarySchema,
    batches: z.array(productionBatchSchema),
    eligibleOrders: z.array(productionPendingOrderSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const productionWorkspaceShiftCandidateSchema = z
  .object({
    productionShiftId: productionIdSchema,
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    reason: z.enum(['started_run', 'accepted_plan', 'open_shift']),
    productionRunId: productionIdSchema.nullable(),
    scheduleRunId: productionIdSchema.nullable(),
  })
  .strict();

export const productionDemandOutlookItemSchema = z
  .object({
    orderDemandId: productionIdSchema,
    productionOrderId: productionIdSchema.nullable(),
    externalOrderId: z.string().min(1),
    phase: productionDemandPhaseSchema,
    dueAt: utcIsoStringSchema,
    estimatedWeightLbs: z.number().positive().nullable(),
    readiness: productionDemandReadinessSchema,
    productionStatus: productionOrderStatusSchema.nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const productionDemandForecastBatchSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    demandIds: z.array(productionIdSchema).min(1),
    estimatedWeightLbs: z.number().positive(),
    expectedOrderCount: z.number().int().nonnegative(),
    readyOrderCount: z.number().int().nonnegative(),
  })
  .strict();

export const productionDemandForecastSchema = z
  .object({
    algorithmVersion: z.literal('fixed-pulse-demand-outlook-v1'),
    startsAt: utcIsoStringSchema,
    completesAt: utcIsoStringSchema,
    pulseMinutes: z.number().int().positive(),
    pulseCapacityLbs: z.number().nonnegative(),
    batchCount: z.number().int().nonnegative(),
    makespanMinutes: z.number().int().nonnegative(),
    batches: z.array(productionDemandForecastBatchSchema),
    unplacedDemandIds: z.array(productionIdSchema),
  })
  .strict();

export const productionDemandOutlookSchema = z
  .object({
    productionShiftId: productionIdSchema,
    horizonCutoffAt: utcIsoStringSchema,
    totalOrderCount: z.number().int().nonnegative(),
    totalEstimatedWeightLbs: z.number().nonnegative(),
    estimateMissingOrderCount: z.number().int().nonnegative(),
    expectedOrderCount: z.number().int().nonnegative(),
    expectedEstimatedWeightLbs: z.number().nonnegative(),
    readyOrderCount: z.number().int().nonnegative(),
    readyEstimatedWeightLbs: z.number().nonnegative(),
    inProductionOrderCount: z.number().int().nonnegative(),
    inProductionEstimatedWeightLbs: z.number().nonnegative(),
    items: z.array(productionDemandOutlookItemSchema),
    forecast: productionDemandForecastSchema.nullable(),
  })
  .strict();

export const productionWorkspaceSchema = z
  .object({
    location: productionLocationSchema,
    currentShift: productionShiftSchema.nullable(),
    shiftSelection: productionShiftSelectionSchema.nullable(),
    candidateShifts: z.array(productionWorkspaceShiftCandidateSchema),
    currentSchedulerConfig: schedulerConfigSchema.nullable(),
    currentScheduleProposal: scheduleProposalSchema.nullable(),
    activeRuns: z.array(productionRunSummarySchema),
    orders: z.array(productionOrderListItemSchema),
    pendingEligibleOrders: z.array(productionPendingOrderSchema),
    liveRunChanges: productionLiveRunChangesSchema.nullable(),
    demandOutlook: productionDemandOutlookSchema.nullable(),
    board: productionBoardSchema.nullable(),
    stations: z.array(productionStationSchema),
    machines: z.array(productionMachineSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export type ProductionPendingOrder = z.infer<
  typeof productionPendingOrderSchema
>;
export type ProductionStageStartTiming = z.infer<
  typeof productionStageStartTimingSchema
>;
export type StageRun = z.infer<typeof stageRunSchema>;
export type ProductionRunSummary = z.infer<typeof productionRunSummarySchema>;
export type ProductionLiveAutomaticPlacement = z.infer<
  typeof productionLiveAutomaticPlacementSchema
>;
export type ProductionLiveExactBatchTarget = z.infer<
  typeof productionLiveExactBatchTargetSchema
>;
export type ProductionPendingPlacement = z.infer<
  typeof productionPendingPlacementSchema
>;
export type ProductionLiveRunChangeOrder = z.infer<
  typeof productionLiveRunChangeOrderSchema
>;
export type ProductionLiveRunChanges = z.infer<
  typeof productionLiveRunChangesSchema
>;
export type ProductionBatchOrder = z.infer<typeof productionBatchOrderSchema>;
export type ProductionBatch = z.infer<typeof productionBatchSchema>;
export type ProductionBoard = z.infer<typeof productionBoardSchema>;
export type ProductionWorkspace = z.infer<typeof productionWorkspaceSchema>;
