import { z } from 'zod';
import {
  productionHashSchema,
  productionIdSchema,
  productionOrderStatusSchema,
  productionPlacementProvenanceSchema,
  productionStageBoundaryProvenanceSchema,
  productionStageKindSchema,
} from './production.contracts.ts';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';
import { productionOrderRouteReasonSchema } from './production-order-control.contracts.ts';

export const productionHistoryCursorSchema = z.string().min(1).max(1_000);

const productionHistoryPageQueryShape = {
  cursor: productionHistoryCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
} as const;

const productionHistorySearchSchema = z.string().trim().min(1).max(120);

export const listProductionHistoryRunsQuerySchema = z
  .object({
    ...productionHistoryPageQueryShape,
    search: productionHistorySearchSchema.optional(),
    status: z.enum(['started', 'completed']).optional(),
    createdAfter: utcIsoStringSchema.optional(),
  })
  .strict();

export const productionHistoryEntityTypeSchema = z.enum([
  'order_demand',
  'production_resource_manifest',
  'scheduler_config',
  'production_shift',
  'schedule_run',
  'production_run',
  'production_order',
  'production_batch',
  'stage_run',
]);

export const productionHistoryEventTypeSchema = z.enum([
  'order_demand_applied',
  'production_resources_bootstrapped',
  'scheduler_config_published',
  'production_shift_created',
  'production_shift_updated',
  'schedule_computed',
  'schedule_accepted',
  'production_run_started',
  'production_order_priority_changed',
  'production_order_intake_recorded',
  'production_order_placement_pending',
  'production_order_placement_overtime_required',
  'production_order_placement_resolved',
  'production_order_rebatched',
  'production_order_route_exception_recorded',
  'batch_membership_frozen',
  'batch_membership_unfrozen',
  'machine_assigned',
  'stage_started',
  'stage_completed',
  'batch_progress_reconciled',
]);

export const listProductionHistoryActivityQuerySchema = z
  .object({
    ...productionHistoryPageQueryShape,
    runId: productionIdSchema.optional(),
    entityType: productionHistoryEntityTypeSchema.optional(),
    eventType: productionHistoryEventTypeSchema.optional(),
    search: productionHistorySearchSchema.optional(),
    occurredAfter: utcIsoStringSchema.optional(),
  })
  .strict();

export const listProductionHistoryPlansQuerySchema = z
  .object({
    ...productionHistoryPageQueryShape,
    runId: productionIdSchema.optional(),
    search: productionHistorySearchSchema.optional(),
    status: z.enum(['draft', 'accepted', 'superseded', 'rejected']).optional(),
    createdAfter: utcIsoStringSchema.optional(),
  })
  .strict();

export const productionHistoryLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();

export const productionHistoryRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();

export const productionHistoryRunSummarySchema = z
  .object({
    productionRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    scheduleRunId: productionIdSchema,
    status: z.enum(['started', 'completed']),
    shiftStartsAt: utcIsoStringSchema,
    shiftEndsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    startedAt: utcIsoStringSchema,
    completedAt: utcIsoStringSchema.nullable(),
    plannedCompletionAt: utcIsoStringSchema,
    batchCount: z.number().int().nonnegative(),
    completedBatchCount: z.number().int().nonnegative(),
    orderCount: z.number().int().nonnegative(),
    priorityOrderCount: z.number().int().nonnegative(),
    totalWeightLbs: z.number().nonnegative(),
    queueVersion: z.number().int().positive(),
    overtimeAcknowledged: z.boolean(),
    createdAt: utcIsoStringSchema,
  })
  .strict()
  .refine((run) => run.completedBatchCount <= run.batchCount, {
    path: ['completedBatchCount'],
    message: 'Completed batch count cannot exceed total batch count.',
  })
  .refine((run) => run.priorityOrderCount <= run.orderCount, {
    path: ['priorityOrderCount'],
    message: 'Priority order count cannot exceed total order count.',
  })
  .refine(
    (run) => (run.status === 'completed') === (run.completedAt !== null),
    {
      path: ['completedAt'],
      message: 'Run status and completion boundary must agree.',
    },
  );

export const productionHistoryPlanSummarySchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    linkedProductionRunId: productionIdSchema.nullable(),
    status: z.enum(['draft', 'accepted', 'superseded', 'rejected']),
    shiftStartsAt: utcIsoStringSchema,
    shiftEndsAt: utcIsoStringSchema,
    algorithmVersion: z.string().min(1),
    schedulerConfigId: productionIdSchema,
    inputSnapshotHash: productionHashSchema,
    outputPlanHash: productionHashSchema,
    pulseCapacityLbs: z.number().positive(),
    batchCount: z.number().int().nonnegative(),
    makespanMinutes: z.number().int().nonnegative(),
    plannedCompletionAt: utcIsoStringSchema,
    warningCount: z.number().int().nonnegative(),
    acknowledgedWarningCount: z.number().int().nonnegative(),
    createdAt: utcIsoStringSchema,
    acceptedAt: utcIsoStringSchema.nullable(),
    acceptedBy: productionIdSchema.nullable(),
    supersededAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const productionHistoryActorSchema = z
  .object({
    id: productionIdSchema,
    kind: z.enum(['user', 'system', 'unknown']),
    displayName: z.string().min(1).nullable(),
  })
  .strict();

const nullableIdSchema = productionIdSchema.nullable();
const nullableVersionSchema = z.number().int().positive().nullable();

export const productionHistoryActivityDetailsSchema = z.discriminatedUnion(
  'kind',
  [
    z
      .object({
        kind: z.literal('demand'),
        outcome: z.string().min(1).nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('configuration'),
        version: nullableVersionSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('shift'),
        changedFields: z.array(z.string().min(1)),
        supersededScheduleRunId: nullableIdSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('schedule'),
        productionShiftId: nullableIdSchema,
        inputSnapshotHash: productionHashSchema.nullable(),
        outputPlanHash: productionHashSchema.nullable(),
        acknowledgedWarningCount: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('run'),
        scheduleRunId: nullableIdSchema,
        batchCount: z.number().int().nonnegative().nullable(),
        queueVersion: nullableVersionSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal('order'),
        productionRunId: nullableIdSchema,
        sourceBatchId: nullableIdSchema,
        targetBatchId: nullableIdSchema,
        outcome: z.string().min(1).nullable(),
        bagCount: z.number().int().nonnegative().nullable(),
        priority: z.boolean().nullable(),
        queueVersion: nullableVersionSchema,
        version: nullableVersionSchema,
        routeReason: productionOrderRouteReasonSchema.nullable(),
        restartStage: productionStageKindSchema.nullable(),
        releasedStages: z.array(productionStageKindSchema),
        assignedStages: z.array(productionStageKindSchema),
      })
      .strict(),
    z
      .object({
        kind: z.literal('batch'),
        action: z.string().min(1),
        queueVersion: nullableVersionSchema,
        batchVersion: nullableVersionSchema,
        currentMilestone: z.string().min(1).nullable(),
        targetMilestone: z.string().min(1).nullable(),
        reason: z.string().min(1).nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('stage'),
        action: z.enum(['assigned', 'started', 'completed']),
        version: nullableVersionSchema,
        machineIds: z.array(productionIdSchema),
        timingConfirmationRecorded: z.boolean(),
      })
      .strict(),
  ],
);

export const productionHistoryActivityEntrySchema = z
  .object({
    id: productionIdSchema,
    eventType: productionHistoryEventTypeSchema,
    entityType: productionHistoryEntityTypeSchema,
    entityId: productionIdSchema,
    actor: productionHistoryActorSchema,
    expectedVersion: z.number().int().positive().nullable(),
    productionRunId: productionIdSchema.nullable(),
    summary: z.string().min(1),
    details: productionHistoryActivityDetailsSchema,
    occurredAt: utcIsoStringSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    const expectedKind =
      entry.eventType === 'order_demand_applied'
        ? 'demand'
        : entry.eventType === 'production_resources_bootstrapped' ||
            entry.eventType === 'scheduler_config_published'
          ? 'configuration'
          : entry.eventType === 'production_shift_created' ||
              entry.eventType === 'production_shift_updated'
            ? 'shift'
            : entry.eventType === 'schedule_computed' ||
                entry.eventType === 'schedule_accepted'
              ? 'schedule'
              : entry.eventType === 'production_run_started'
                ? 'run'
                : entry.eventType.startsWith('production_order_')
                  ? 'order'
                  : entry.eventType.startsWith('batch_')
                    ? 'batch'
                    : 'stage';
    if (entry.details.kind !== expectedKind)
      context.addIssue({
        code: 'custom',
        path: ['details', 'kind'],
        message: 'Activity event and sanitized detail kind must agree.',
      });
  });

const productionHistoryPageResultShape = {
  nextCursor: productionHistoryCursorSchema.nullable(),
  asOf: utcIsoStringSchema,
} as const;

export const listProductionHistoryRunsResultSchema = z
  .object({
    items: z.array(productionHistoryRunSummarySchema),
    ...productionHistoryPageResultShape,
  })
  .strict();

export const listProductionHistoryActivityResultSchema = z
  .object({
    items: z.array(productionHistoryActivityEntrySchema),
    ...productionHistoryPageResultShape,
  })
  .strict();

export const listProductionHistoryPlansResultSchema = z
  .object({
    items: z.array(productionHistoryPlanSummarySchema),
    ...productionHistoryPageResultShape,
  })
  .strict();

export const productionHistoryBatchSummarySchema = z
  .object({
    productionBatchId: productionIdSchema,
    sequence: z.number().int().nonnegative(),
    status: z.enum([
      'queued',
      'sorting',
      'washing',
      'drying',
      'folding_packaging',
      'finished',
    ]),
    derivedWeightLbs: z.number().positive(),
    pulseCapacityLbs: z.number().positive(),
    currentOrderCount: z.number().int().nonnegative(),
    historicalOrderCount: z.number().int().nonnegative(),
    startedAt: utcIsoStringSchema.nullable(),
    finishedAt: utcIsoStringSchema.nullable(),
  })
  .strict()
  .refine((batch) => batch.currentOrderCount <= batch.historicalOrderCount, {
    path: ['currentOrderCount'],
    message: 'Current order count cannot exceed historical order count.',
  })
  .refine(
    (batch) => (batch.status === 'finished') === (batch.finishedAt !== null),
    {
      path: ['finishedAt'],
      message: 'Batch status and finish boundary must agree.',
    },
  );

export const productionHistoryStageProgressSchema = z
  .object({
    stageRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    batchSequence: z.number().int().nonnegative(),
    stage: productionStageKindSchema,
    status: z.enum(['planned', 'started', 'completed']),
    plannedStartAt: utcIsoStringSchema,
    plannedEndAt: utcIsoStringSchema,
    actualStartAt: utcIsoStringSchema.nullable(),
    actualEndAt: utcIsoStringSchema.nullable(),
    actualStartProvenance: productionStageBoundaryProvenanceSchema,
    actualEndProvenance: productionStageBoundaryProvenanceSchema,
    startedBy: productionIdSchema.nullable(),
    completedBy: productionIdSchema.nullable(),
    machineCount: z.number().int().nonnegative(),
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
        message: 'Actual start boundary and provenance must agree.',
      });
    if (
      (stage.actualEndAt === null) !==
      (stage.actualEndProvenance === 'not_recorded')
    )
      context.addIssue({
        code: 'custom',
        path: ['actualEndProvenance'],
        message: 'Actual end boundary and provenance must agree.',
      });
  });

export const productionHistoryOrderMembershipPlacementSchema =
  z.discriminatedUnion('state', [
    z
      .object({
        state: z.literal('current'),
        placedAt: utcIsoStringSchema,
        placedBy: productionIdSchema.nullable(),
      })
      .strict(),
    z
      .object({
        state: z.literal('released'),
        placedAt: utcIsoStringSchema,
        placedBy: productionIdSchema.nullable(),
        releasedAt: utcIsoStringSchema.nullable(),
        releasedBy: productionIdSchema.nullable(),
        reason: z.string().min(1).nullable(),
      })
      .strict()
      .refine(
        (placement) =>
          [placement.releasedAt, placement.releasedBy, placement.reason].every(
            (value) => value === null,
          ) ||
          [placement.releasedAt, placement.releasedBy, placement.reason].every(
            (value) => value !== null,
          ),
        {
          path: ['releasedAt'],
          message:
            'Release boundary, actor, and reason must be recorded together.',
        },
      ),
  ]);

export const productionHistoryOrderMembershipSchema = z
  .object({
    membershipId: productionIdSchema,
    productionOrderId: productionIdSchema,
    externalOrderId: z.string().min(1),
    orderStatus: productionOrderStatusSchema,
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative().nullable(),
    productionBatchId: productionIdSchema,
    batchSequence: z.number().int().nonnegative(),
    placementProvenance: productionPlacementProvenanceSchema,
    placement: productionHistoryOrderMembershipPlacementSchema,
  })
  .strict();

export const productionHistoryRunActivitySchema = z
  .object({
    items: z.array(productionHistoryActivityEntrySchema).max(100),
    hasMore: z.boolean(),
  })
  .strict();

export const productionHistoryRunDetailSchema = z
  .object({
    overview: productionHistoryRunSummarySchema,
    batches: z.array(productionHistoryBatchSummarySchema),
    orderMemberships: z.array(productionHistoryOrderMembershipSchema),
    stageProgress: z
      .object({
        planned: z.number().int().nonnegative(),
        started: z.number().int().nonnegative(),
        completed: z.number().int().nonnegative(),
        items: z.array(productionHistoryStageProgressSchema),
      })
      .strict(),
    scheduleLineage: z
      .object({
        executionScheduleRunId: productionIdSchema,
        revisions: z.array(productionHistoryPlanSummarySchema).min(1),
      })
      .strict(),
    activity: productionHistoryRunActivitySchema,
    asOf: utcIsoStringSchema,
  })
  .strict();

export type ListProductionHistoryRunsQuery = z.infer<
  typeof listProductionHistoryRunsQuerySchema
>;
export type ListProductionHistoryActivityQuery = z.infer<
  typeof listProductionHistoryActivityQuerySchema
>;
export type ListProductionHistoryPlansQuery = z.infer<
  typeof listProductionHistoryPlansQuerySchema
>;
export type ProductionHistoryRunSummary = z.infer<
  typeof productionHistoryRunSummarySchema
>;
export type ProductionHistoryPlanSummary = z.infer<
  typeof productionHistoryPlanSummarySchema
>;
export type ProductionHistoryActivityEntry = z.infer<
  typeof productionHistoryActivityEntrySchema
>;
export type ProductionHistoryBatchSummary = z.infer<
  typeof productionHistoryBatchSummarySchema
>;
export type ProductionHistoryStageProgress = z.infer<
  typeof productionHistoryStageProgressSchema
>;
export type ProductionHistoryOrderMembership = z.infer<
  typeof productionHistoryOrderMembershipSchema
>;
export type ListProductionHistoryRunsResult = z.infer<
  typeof listProductionHistoryRunsResultSchema
>;
export type ListProductionHistoryActivityResult = z.infer<
  typeof listProductionHistoryActivityResultSchema
>;
export type ListProductionHistoryPlansResult = z.infer<
  typeof listProductionHistoryPlansResultSchema
>;
export type ProductionHistoryRunDetail = z.infer<
  typeof productionHistoryRunDetailSchema
>;
