import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';
import {
  productionAdmissionOverrideSchema,
  productionBatchStatusSchema,
  productionDueBucketSchema,
  productionHashSchema,
  productionIdSchema,
  productionOrderListItemSchema,
  productionOrderStatusSchema,
  productionPlacementProvenanceSchema,
  productionStageKindSchema,
} from './production.contracts.ts';

export const productionAdmissionActionSchema = z.enum([
  'release',
  'return_to_source',
]);

export const productionOrderAdmissionSchema = z
  .object({
    sourceState: z.enum(['unreleased', 'released', 'withdrawn']),
    override: productionAdmissionOverrideSchema,
    effectiveState: z.enum(['unreleased', 'released', 'withdrawn']),
    allowedActions: z.array(productionAdmissionActionSchema),
  })
  .strict();

export const productionOrderAttentionReasonSchema = z.enum([
  'intake_required',
  'placement_pending',
  'placement_conflict',
  'route_blocked',
]);

export const productionOrderRouteReasonSchema = z.enum([
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
]);

export const productionOrderRouteAttemptStatusSchema = z.enum([
  'assigned',
  'completed',
  'released',
]);

export const productionOrderRouteAssignmentReasonSchema = z.enum([
  'initial_schedule',
  'automatic',
  'manager_exact',
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
]);

export const productionOrderRouteAttemptSchema = z
  .object({
    id: productionIdSchema,
    productionRunId: productionIdSchema,
    stageRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    batchSequence: z.number().int().nonnegative(),
    batchStatus: productionBatchStatusSchema,
    stage: productionStageKindSchema,
    stageStatus: z.enum(['planned', 'started', 'completed']),
    attemptNumber: z.number().int().positive(),
    status: productionOrderRouteAttemptStatusSchema,
    assignmentReason: productionOrderRouteAssignmentReasonSchema,
    assignedAt: utcIsoStringSchema,
    assignedBy: productionIdSchema.nullable(),
    completedAt: utcIsoStringSchema.nullable(),
    completedBy: productionIdSchema.nullable(),
    releasedAt: utcIsoStringSchema.nullable(),
    releasedBy: productionIdSchema.nullable(),
    releaseReason: productionOrderRouteReasonSchema.nullable(),
  })
  .strict();

export const productionOrderCurrentPlacementSchema = z
  .object({
    productionRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    batchSequence: z.number().int().nonnegative(),
    batchStatus: productionBatchStatusSchema,
    batchVersion: z.number().int().positive(),
    queueVersion: z.number().int().positive(),
    membershipFrozen: z.boolean(),
    placementProvenance: productionPlacementProvenanceSchema,
    pinnedAt: utcIsoStringSchema.nullable(),
    pinnedBy: productionIdSchema.nullable(),
  })
  .strict();

export const productionOrderResolutionReviewReasonSchema = z.enum([
  'intake_recorded',
  'manual_admission',
  'priority',
  'pending_placement',
]);

export const productionOrderResolutionDenialReasonSchema = z.enum([
  'execution_state_invalid',
  'execution_finished',
  'resolution_transition_invalid',
  'execution_committed',
  'selected_for_shift',
  'batch_membership_exists',
  'stage_attempt_exists',
  'route_exists',
]);

export const productionOrderResolutionAvailabilitySchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('allowed'),
        expectedVersion: z.number().int().positive(),
        requiresExplicitReview: z.boolean(),
        reviewReasons: z.array(productionOrderResolutionReviewReasonSchema),
      })
      .strict(),
    z
      .object({
        status: z.literal('blocked'),
        reasons: z.array(productionOrderResolutionDenialReasonSchema).min(1),
      })
      .strict(),
  ],
);

export const productionOrderRouteCommandDenialCodeSchema = z.enum([
  'PRODUCTION_ORDER_ROUTE_NOT_FOUND',
  'PRODUCTION_RUN_NOT_STARTED',
  'PRODUCTION_ORDER_RESOLVED',
  'PRODUCTION_ORDER_RESOLUTION_STATE_INVALID',
  'PRODUCTION_ORDER_EXECUTION_STATE_INVALID',
  'PRODUCTION_ORDER_NOT_SCHEDULED',
  'SOURCE_BATCH_WOULD_BE_EMPTY',
  'ORDER_WEIGHT_INVALID',
  'SOURCE_BATCH_INVALID',
  'QUEUED_REBATCH_SOURCE_NOT_QUEUED',
  'QUEUED_REBATCH_SOURCE_FROZEN',
  'EXCEPTION_SOURCE_NOT_IN_FLIGHT',
  'SOURCE_CURRENT_STAGE_MISMATCH',
  'RESTART_STAGE_SKIPS_REQUIRED_WORK',
  'TARGET_STAGE_GRAPH_INVALID',
  'NO_LATER_TARGET',
  'NO_FEASIBLE_TARGET',
  'HARD_CAPACITY_EXCEEDED',
]);

export const productionQueuedMoveTargetDenialCodeSchema = z.enum([
  'TARGET_IS_SOURCE_BATCH',
  'TARGET_NOT_QUEUED',
  'TARGET_MEMBERSHIP_FROZEN',
  'TARGET_STAGE_GRAPH_INVALID',
  'TARGET_STAGE_NOT_PLANNED',
  'HARD_CAPACITY_EXCEEDED',
]);

export const productionQueuedMoveTargetFeasibilitySchema = z.discriminatedUnion(
  'status',
  [
    z.object({ status: z.literal('allowed') }).strict(),
    z
      .object({
        status: z.literal('blocked'),
        code: productionQueuedMoveTargetDenialCodeSchema,
      })
      .strict(),
  ],
);

export const productionQueuedMoveTargetSchema = z
  .object({
    productionBatchId: productionIdSchema,
    batchSequence: z.number().int().nonnegative(),
    batchStatus: productionBatchStatusSchema,
    membershipFrozen: z.boolean(),
    expectedBatchVersion: z.number().int().positive(),
    currentWeightLbs: z.number().nonnegative(),
    projectedWeightLbs: z.number().positive(),
    capacityLbs: z.number().nonnegative(),
    feasibility: productionQueuedMoveTargetFeasibilitySchema,
  })
  .strict();

const productionOrderRouteCapabilityVersionFields = {
  expectedQueueVersion: z.number().int().positive(),
  expectedOrderVersion: z.number().int().positive(),
  expectedSourceBatchVersion: z.number().int().positive(),
} as const;

export const productionQueuedMoveCapabilitySchema = z
  .discriminatedUnion('status', [
    z
      .object({
        status: z.literal('allowed'),
        ...productionOrderRouteCapabilityVersionFields,
        targets: z.array(productionQueuedMoveTargetSchema).min(1),
      })
      .strict(),
    z
      .object({
        status: z.literal('blocked'),
        code: productionOrderRouteCommandDenialCodeSchema,
        targets: z.array(productionQueuedMoveTargetSchema),
      })
      .strict(),
  ])
  .superRefine((capability, context) => {
    if (
      capability.status === 'allowed' &&
      !capability.targets.some(
        (target) => target.feasibility.status === 'allowed',
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'An allowed queued move requires an allowed target batch.',
      });
  });

export const productionRouteExceptionCapabilitySchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        status: z.literal('allowed'),
        ...productionOrderRouteCapabilityVersionFields,
      })
      .strict(),
    z
      .object({
        status: z.literal('blocked'),
        code: productionOrderRouteCommandDenialCodeSchema,
      })
      .strict(),
  ],
);

export const productionOrderCommandCapabilitiesSchema = z
  .object({
    queuedMove: productionQueuedMoveCapabilitySchema,
    routeException: productionRouteExceptionCapabilitySchema,
  })
  .strict();

export const productionOrderControlItemSchema = z
  .object({
    order: productionOrderListItemSchema,
    admission: productionOrderAdmissionSchema,
    attention: z
      .object({
        reason: productionOrderAttentionReasonSchema,
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    currentPlacement: productionOrderCurrentPlacementSchema.nullable(),
    nextRequiredStage: productionStageKindSchema.nullable(),
    routeAttempts: z.array(productionOrderRouteAttemptSchema),
    commands: productionOrderCommandCapabilitiesSchema,
    resolutionAction: productionOrderResolutionAvailabilitySchema,
  })
  .strict();

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const listProductionOrderControlQuerySchema = z
  .object({
    view: z.enum(['attention', 'active', 'intake', 'all']).default('attention'),
    search: z.string().trim().min(1).max(120).optional(),
    status: productionOrderStatusSchema.optional(),
    dueBucket: productionDueBucketSchema.optional(),
    productionRunId: productionIdSchema.optional(),
    productionBatchId: productionIdSchema.optional(),
    stage: productionStageKindSchema.optional(),
    priority: queryBooleanSchema.optional(),
    movable: queryBooleanSchema.optional(),
    cursor: z.string().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export const listProductionOrderControlResultSchema = z
  .object({
    items: z.array(productionOrderControlItemSchema),
    counts: z
      .object({
        attention: z.number().int().nonnegative(),
        active: z.number().int().nonnegative(),
        all: z.number().int().nonnegative(),
      })
      .strict(),
    nextCursor: z.string().min(1).nullable(),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const productionOrderRoutingParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
    productionOrderId: productionIdSchema,
  })
  .strict();

const queuedMoveFields = {
  kind: z.literal('queued_move'),
  reason: z.literal('manual_rebatch'),
  targetProductionBatchId: productionIdSchema,
  restartStage: z.literal('sorting'),
} as const;

const exceptionFields = {
  kind: z.literal('exception'),
  reason: productionOrderRouteReasonSchema.exclude(['manual_rebatch']),
  restartStage: productionStageKindSchema,
  note: z.string().trim().min(1).max(500).optional(),
} as const;

const routingConcurrencyFields = {
  expectedQueueVersion: z.number().int().positive(),
  expectedOrderVersion: z.number().int().positive(),
  expectedSourceBatchVersion: z.number().int().positive(),
} as const;

export const previewProductionOrderRouteRequestSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ ...queuedMoveFields, ...routingConcurrencyFields }).strict(),
    z
      .object({ ...exceptionFields, ...routingConcurrencyFields })
      .strict()
      .superRefine((value, context) => {
        if (value.reason === 'other' && value.note === undefined)
          context.addIssue({
            code: 'custom',
            path: ['note'],
            message: 'An explanatory note is required for the other reason.',
          });
      }),
  ],
);

export const commitProductionOrderRouteRequestSchema = z.discriminatedUnion(
  'kind',
  [
    z
      .object({
        ...queuedMoveFields,
        ...routingConcurrencyFields,
        proposalHash: productionHashSchema,
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict(),
    z
      .object({
        ...exceptionFields,
        ...routingConcurrencyFields,
        proposalHash: productionHashSchema,
        idempotencyKey: z.string().min(8).max(200),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.reason === 'other' && value.note === undefined)
          context.addIssue({
            code: 'custom',
            path: ['note'],
            message: 'An explanatory note is required for the other reason.',
          });
      }),
  ],
);

export const productionOrderRouteProposalSchema = z
  .object({
    kind: z.enum(['queued_move', 'exception']),
    productionRunId: productionIdSchema,
    productionOrderId: productionIdSchema,
    sourceProductionBatchId: productionIdSchema,
    sourceBatchSequence: z.number().int().nonnegative(),
    targetProductionBatchId: productionIdSchema,
    targetBatchSequence: z.number().int().nonnegative(),
    restartStage: productionStageKindSchema,
    releasedStages: z.array(productionStageKindSchema).min(1),
    assignedStages: z.array(productionStageKindSchema).min(1),
    orderWeightLbs: z.number().positive(),
    targetWeightLbs: z.number().positive(),
    targetCapacityLbs: z.number().positive(),
    expectedQueueVersion: z.number().int().positive(),
    expectedOrderVersion: z.number().int().positive(),
    expectedSourceBatchVersion: z.number().int().positive(),
    expectedTargetBatchVersion: z.number().int().positive(),
    proposalHash: productionHashSchema,
  })
  .strict();

export const commitProductionOrderRouteResultSchema = z
  .object({
    status: z.literal('routed'),
    proposal: productionOrderRouteProposalSchema,
    queueVersion: z.number().int().positive(),
    orderVersion: z.number().int().positive(),
    sourceBatchVersion: z.number().int().positive(),
    targetBatchVersion: z.number().int().positive(),
    createdAttemptIds: z.array(productionIdSchema).min(1),
    replayed: z.boolean(),
  })
  .strict();

export type ProductionOrderAttentionReason = z.infer<
  typeof productionOrderAttentionReasonSchema
>;
export type ProductionOrderRouteReason = z.infer<
  typeof productionOrderRouteReasonSchema
>;
export type ProductionOrderRouteAttempt = z.infer<
  typeof productionOrderRouteAttemptSchema
>;
export type ProductionOrderControlItem = z.infer<
  typeof productionOrderControlItemSchema
>;
export type ProductionOrderResolutionAvailability = z.infer<
  typeof productionOrderResolutionAvailabilitySchema
>;
export type ProductionOrderResolutionDenialReason = z.infer<
  typeof productionOrderResolutionDenialReasonSchema
>;
export type ProductionOrderRouteCommandDenialCode = z.infer<
  typeof productionOrderRouteCommandDenialCodeSchema
>;
export type ProductionQueuedMoveTargetDenialCode = z.infer<
  typeof productionQueuedMoveTargetDenialCodeSchema
>;
export type ProductionQueuedMoveTarget = z.infer<
  typeof productionQueuedMoveTargetSchema
>;
export type ProductionQueuedMoveCapability = z.infer<
  typeof productionQueuedMoveCapabilitySchema
>;
export type ProductionRouteExceptionCapability = z.infer<
  typeof productionRouteExceptionCapabilitySchema
>;
export type ProductionOrderCommandCapabilities = z.infer<
  typeof productionOrderCommandCapabilitiesSchema
>;
export type ProductionAdmissionAction = z.infer<
  typeof productionAdmissionActionSchema
>;
export type ProductionOrderAdmission = z.infer<
  typeof productionOrderAdmissionSchema
>;
export type ListProductionOrderControlQuery = z.infer<
  typeof listProductionOrderControlQuerySchema
>;
export type ListProductionOrderControlResult = z.infer<
  typeof listProductionOrderControlResultSchema
>;
export type PreviewProductionOrderRouteRequest = z.infer<
  typeof previewProductionOrderRouteRequestSchema
>;
export type CommitProductionOrderRouteRequest = z.infer<
  typeof commitProductionOrderRouteRequestSchema
>;
export type ProductionOrderRouteProposal = z.infer<
  typeof productionOrderRouteProposalSchema
>;
export type CommitProductionOrderRouteResult = z.infer<
  typeof commitProductionOrderRouteResultSchema
>;
