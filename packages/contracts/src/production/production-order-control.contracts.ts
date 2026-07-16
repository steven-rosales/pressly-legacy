import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';
import {
  productionBatchStatusSchema,
  productionHashSchema,
  productionIdSchema,
  productionOrderListItemSchema,
  productionOrderStatusSchema,
  productionPlacementProvenanceSchema,
  productionStageKindSchema,
} from './production.contracts.ts';

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

export const productionOrderControlItemSchema = z
  .object({
    order: productionOrderListItemSchema,
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
    canMoveQueued: z.boolean(),
    canRouteException: z.boolean(),
  })
  .strict();

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const listProductionOrderControlQuerySchema = z
  .object({
    view: z.enum(['attention', 'active', 'all']).default('attention'),
    search: z.string().trim().min(1).max(120).optional(),
    status: productionOrderStatusSchema.optional(),
    dueAfter: utcIsoStringSchema.optional(),
    dueBefore: utcIsoStringSchema.optional(),
    productionRunId: productionIdSchema.optional(),
    productionBatchId: productionIdSchema.optional(),
    stage: productionStageKindSchema.optional(),
    priority: queryBooleanSchema.optional(),
    movable: queryBooleanSchema.optional(),
    cursor: z.string().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict()
  .refine(
    (query) =>
      query.dueAfter === undefined ||
      query.dueBefore === undefined ||
      Date.parse(query.dueBefore) > Date.parse(query.dueAfter),
    { path: ['dueBefore'], message: 'dueBefore must be after dueAfter.' },
  );

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
