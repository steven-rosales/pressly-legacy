import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

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
export const productionDemandReconciliationSchema = z.enum([
  'none',
  'source_ahead',
  'source_withdrawn',
  'source_behind',
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

export const productionLocationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    timezone: z.string().min(1),
    isActive: z.boolean(),
  })
  .strict();

export const productionStationSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    kind: productionStageKindSchema,
    label: z.string().min(1),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .strict();

export const productionMachineSchema = z
  .object({
    id: productionIdSchema,
    stationKind: z.enum(['washing', 'drying']),
    label: z.string().min(1),
    effectiveCapacityLbs: z.number().positive(),
    active: z.boolean(),
  })
  .strict();

export const productionShiftSchema = z
  .object({
    id: productionIdSchema,
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    status: z.enum(['draft', 'open', 'closed']),
    version: z.number().int().positive(),
  })
  .strict();

export const productionShiftSelectionSchema = z
  .object({
    productionShiftId: productionIdSchema,
    version: z.number().int().nonnegative(),
    selectedOrderIds: z.array(productionIdSchema),
  })
  .strict()
  .superRefine((selection, context) => {
    if (
      new Set(selection.selectedOrderIds).size !==
      selection.selectedOrderIds.length
    )
      context.addIssue({
        code: 'custom',
        path: ['selectedOrderIds'],
        message: 'Selected order IDs must be unique.',
      });
  });

export const schedulerConfigSchema = z
  .object({
    id: productionIdSchema,
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    algorithmVersion: productionAlgorithmVersionSchema,
    version: z.number().int().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
        assertedBy: productionIdSchema,
        assertedAt: utcIsoStringSchema,
      })
      .strict(),
    publishedAt: utcIsoStringSchema,
  })
  .strict();

export const plannedStageSchema = z
  .object({
    stage: productionStageKindSchema,
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    machineIds: z.array(productionIdSchema),
  })
  .strict();

export const proposedBatchSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    orderIds: z.array(productionIdSchema).min(1),
    derivedWeightLbs: z.number().positive(),
    bagCount: z.number().int().nonnegative(),
    stages: z.array(plannedStageSchema).length(4),
  })
  .strict();

export const scheduleProposalSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    status: z.enum(['draft', 'accepted', 'superseded', 'rejected']),
    inputSnapshotHash: productionHashSchema,
    outputPlanHash: productionHashSchema,
    algorithmVersion: productionAlgorithmVersionSchema,
    pulseMinutes: z.number().int().positive(),
    pulseCapacityLbs: z.number().positive(),
    batchCount: z.number().int().nonnegative(),
    makespanMinutes: z.number().int().nonnegative(),
    plannedCompletionAt: utcIsoStringSchema,
    batches: z.array(proposedBatchSchema),
    unplacedOrderIds: z.array(productionIdSchema),
    warnings: z.array(productionWarningSchema),
    createdAt: utcIsoStringSchema,
    acceptedAt: utcIsoStringSchema.nullable(),
    acceptedBy: productionIdSchema.nullable(),
    acknowledgedWarningCodes: z.array(productionWarningCodeSchema),
    supersededAt: utcIsoStringSchema.nullable(),
  })
  .strict();

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

/** @deprecated Use productionStageTimingConfirmationSchema. */
export const productionStageCompletionConfirmationSchema =
  productionStageTimingConfirmationSchema;

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
    // Compatibility projection for older clients. It is always derived from
    // nextAction and is not an independent policy decision.
    allowedActions: z.array(z.enum(['start', 'complete'])),
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
    const expected =
      stage.nextAction.state === 'available' ||
      stage.nextAction.state === 'confirmation_required'
        ? [stage.nextAction.action]
        : [];
    if (
      stage.allowedActions.length !== expected.length ||
      stage.allowedActions.some((action, index) => action !== expected[index])
    )
      context.addIssue({
        code: 'custom',
        path: ['allowedActions'],
        message: 'Allowed actions must be derived from next action.',
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
    sourceStatusCode: z.string().min(1),
    dueAt: utcIsoStringSchema,
    estimatedWeightLbs: z.number().positive().nullable(),
    readiness: productionDemandReadinessSchema,
    productionStatus: productionOrderStatusSchema.nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
    reconciliation: productionDemandReconciliationSchema,
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
    reconciliationCount: z.number().int().nonnegative(),
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
    demandOutlook: productionDemandOutlookSchema.nullable(),
    board: productionBoardSchema.nullable(),
    stations: z.array(productionStationSchema),
    machines: z.array(productionMachineSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);

export const listProductionLocationsQuerySchema = z
  .object({ includeInactive: queryBooleanSchema.optional().default(false) })
  .strict();

export const listProductionLocationsResultSchema = z
  .object({
    items: z.array(productionLocationSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const listProductionOrdersQuerySchema = z
  .object({
    status: productionOrderStatusSchema.optional(),
    dueAfter: utcIsoStringSchema.optional(),
    dueBefore: utcIsoStringSchema.optional(),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    (query) =>
      query.dueAfter === undefined ||
      query.dueBefore === undefined ||
      Date.parse(query.dueBefore) > Date.parse(query.dueAfter),
    { path: ['dueBefore'], message: 'dueBefore must be after dueAfter.' },
  );

export const listProductionOrdersResultSchema = z
  .object({
    items: z.array(productionOrderListItemSchema),
    nextCursor: z.string().min(1).nullable(),
    asOf: utcIsoStringSchema,
  })
  .strict();

export const publishSchedulerConfigCommandSchema = z
  .object({
    locationId: z.string().min(1),
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
      })
      .strict(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const publishSchedulerConfigRequestSchema =
  publishSchedulerConfigCommandSchema.omit({ locationId: true });

export const createProductionShiftCommandSchema = z
  .object({
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

export const createProductionShiftRequestSchema = z
  .object({
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

const productionShiftUpdateFields = {
  startsAt: utcIsoStringSchema,
  endsAt: utcIsoStringSchema,
  effectiveFolderCount: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

const validProductionShiftUpdateWindow = (value: {
  startsAt: string;
  endsAt: string;
}) => Date.parse(value.endsAt) > Date.parse(value.startsAt);

export const updateProductionShiftCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    ...productionShiftUpdateFields,
  })
  .strict()
  .refine(
    validProductionShiftUpdateWindow,
    'Shift end must be after its start.',
  );

export const updateProductionShiftRequestSchema = z
  .object(productionShiftUpdateFields)
  .strict()
  .refine(
    validProductionShiftUpdateWindow,
    'Shift end must be after its start.',
  );

export const updateProductionShiftResultSchema = z
  .object({
    productionShift: productionShiftSchema,
    supersededScheduleRunId: productionIdSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

const replaceProductionShiftSelectionFields = {
  selectedOrderIds: z
    .array(productionIdSchema)
    .max(1000)
    .superRefine((orderIds, context) => {
      if (new Set(orderIds).size !== orderIds.length)
        context.addIssue({
          code: 'custom',
          message: 'Selected order IDs must be unique.',
        });
    }),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

export const replaceProductionShiftSelectionCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    ...replaceProductionShiftSelectionFields,
  })
  .strict();

export const replaceProductionShiftSelectionRequestSchema = z
  .object(replaceProductionShiftSelectionFields)
  .strict();

export const replaceProductionShiftSelectionResultSchema = z
  .object({
    selection: productionShiftSelectionSchema,
    supersededScheduleRunId: productionIdSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

export const setProductionOrderPriorityCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
    priority: z.boolean(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const setProductionOrderPriorityRequestSchema =
  setProductionOrderPriorityCommandSchema.omit({
    locationId: true,
    productionOrderId: true,
  });

export const createScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const createScheduleRequestSchema = createScheduleCommandSchema.omit({
  locationId: true,
});

export const scheduleRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
  })
  .strict();

export const acceptScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
    expectedOutputPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgedWarningCodes: z.array(productionWarningCodeSchema),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const acceptScheduleRequestSchema = acceptScheduleCommandSchema.omit({
  locationId: true,
  scheduleRunId: true,
});

export const startScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
    expectedOutputPlanHash: productionHashSchema,
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const startScheduleRequestSchema = startScheduleCommandSchema.omit({
  locationId: true,
  scheduleRunId: true,
});

export const productionRunBoardParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();

/** @deprecated Use productionRunBoardParamsSchema. */
export const productionBoardParamsSchema = productionRunBoardParamsSchema;

export const productionRunCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const productionRunRequestSchema = productionRunCommandSchema.omit({
  locationId: true,
  productionRunId: true,
});

export const stageCommandSchema = z
  .object({
    locationId: z.string().min(1),
    stageRunId: productionIdSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const stageRequestSchema = stageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const startStageCommandSchema = stageCommandSchema
  .extend({
    confirmation: productionStageTimingConfirmationSchema.optional(),
  })
  .strict();

export const startStageRequestSchema = startStageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const completeStageCommandSchema = stageCommandSchema
  .extend({
    confirmation: productionStageTimingConfirmationSchema.optional(),
  })
  .strict();

export const completeStageRequestSchema = completeStageCommandSchema.omit({
  locationId: true,
  stageRunId: true,
});

export const assignStageMachinesCommandSchema = stageCommandSchema
  .extend({ machineIds: z.array(productionIdSchema).min(1) })
  .strict();

export const assignStageMachinesRequestSchema =
  assignStageMachinesCommandSchema.omit({
    locationId: true,
    stageRunId: true,
  });

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();

export const productionOrderParamsSchema = productionLocationParamsSchema
  .extend({ productionOrderId: productionIdSchema })
  .strict();

export const productionScheduleParamsSchema = productionLocationParamsSchema
  .extend({ scheduleRunId: productionIdSchema })
  .strict();

export const productionShiftParamsSchema = productionLocationParamsSchema
  .extend({ productionShiftId: productionIdSchema })
  .strict();

export const productionRunParamsSchema = productionLocationParamsSchema
  .extend({ productionRunId: productionIdSchema })
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

export const productionStageParamsSchema = productionLocationParamsSchema
  .extend({ stageRunId: productionIdSchema })
  .strict();

export const productionWorkspaceQuerySchema = z
  .object({ shiftId: productionIdSchema.optional() })
  .strict();

export const productionWorkspaceParamsSchema = productionLocationParamsSchema
  .extend({ shiftId: productionIdSchema.optional() })
  .strict();

const productionQueueCommandFields = {
  locationId: z.string().min(1),
  productionRunId: productionIdSchema,
  expectedQueueVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

const productionBatchMembershipCommandFields = {
  ...productionQueueCommandFields,
  productionBatchId: productionIdSchema,
  expectedBatchVersion: z.number().int().positive(),
} as const;

export const freezeProductionBatchCommandSchema = z
  .object(productionBatchMembershipCommandFields)
  .strict();

export const freezeProductionBatchRequestSchema =
  freezeProductionBatchCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionBatchId: true,
  });

export const unfreezeProductionBatchCommandSchema = z
  .object(productionBatchMembershipCommandFields)
  .strict();

export const unfreezeProductionBatchRequestSchema =
  unfreezeProductionBatchCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionBatchId: true,
  });

export const placeProductionOrderAutomaticallyCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
  })
  .strict();

export const placeProductionOrderAutomaticallyRequestSchema =
  placeProductionOrderAutomaticallyCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
  });

export const placeProductionOrderExactlyCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
    productionBatchId: productionIdSchema,
    expectedBatchVersion: z.number().int().positive(),
  })
  .strict();

export const placeProductionOrderExactlyRequestSchema =
  placeProductionOrderExactlyCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
    productionBatchId: true,
  });

export const confirmProductionOrderOvertimeCommandSchema = z
  .object({
    ...productionQueueCommandFields,
    productionOrderId: productionIdSchema,
    proposalHash: productionHashSchema,
  })
  .strict();

export const confirmProductionOrderOvertimeRequestSchema =
  confirmProductionOrderOvertimeCommandSchema.omit({
    locationId: true,
    productionRunId: true,
    productionOrderId: true,
  });

export const recordOrderIntakeCommandSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const recordOrderIntakeRequestSchema =
  recordOrderIntakeCommandSchema.omit({
    locationId: true,
    orderId: true,
  });

export const recordOrderIntakeResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    bagCountProvenance: z.literal('operator_intake'),
    intakeVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const changeProductionAdmissionCommandSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    target: productionAdmissionTargetSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const changeProductionAdmissionRequestSchema =
  changeProductionAdmissionCommandSchema.omit({
    locationId: true,
    orderId: true,
  });

export const changeProductionAdmissionResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    admissionOverride: productionAdmissionOverrideSchema,
    status: productionOrderStatusSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const productionLocationResourceInputSchema = z
  .object({
    id: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(200),
    timezone: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
  })
  .strict();

export const productionStationResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    kind: productionStageKindSchema,
    label: z.string().trim().min(1).max(200),
    sortOrder: z.number().int().nonnegative(),
    isActive: z.boolean(),
  })
  .strict();

export const productionMachineResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    stationKind: z.enum(['washing', 'drying']),
    label: z.string().trim().min(1).max(200),
    manufacturerCapacityLbs: z.number().positive().nullable(),
    effectiveCapacityLbs: z.number().positive().nullable(),
    capacitySafetyMarginLbs: z.number().nonnegative().nullable(),
    isActive: z.boolean(),
  })
  .strict()
  .superRefine((machine, context) => {
    if (machine.isActive && machine.effectiveCapacityLbs === null)
      context.addIssue({
        code: 'custom',
        path: ['effectiveCapacityLbs'],
        message: 'An active machine requires effective capacity.',
      });
  });

export const schedulerConfigResourceInputSchema = z
  .object({
    locationId: z.string().trim().min(1).max(100),
    pulseMinutes: z.number().int().positive(),
    foldLbsPerFolderMinute: z.number().positive(),
    algorithmVersion: productionAlgorithmVersionSchema,
    stageFitAssertion: z
      .object({
        sortingFits: z.literal(true),
        washingFits: z.literal(true),
        dryingFits: z.literal(true),
      })
      .strict(),
  })
  .strict();

export const productionBootstrapManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    location: productionLocationResourceInputSchema,
    stations: z.array(productionStationResourceInputSchema).min(1),
    machines: z.array(productionMachineResourceInputSchema).min(1),
    schedulerConfig: schedulerConfigResourceInputSchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    const locationId = manifest.location.id;
    const scopedResources = [
      ...manifest.stations.map((resource, index) => ({
        locationId: resource.locationId,
        path: ['stations', index, 'locationId'] as const,
      })),
      ...manifest.machines.map((resource, index) => ({
        locationId: resource.locationId,
        path: ['machines', index, 'locationId'] as const,
      })),
      {
        locationId: manifest.schedulerConfig.locationId,
        path: ['schedulerConfig', 'locationId'] as const,
      },
    ];

    for (const resource of scopedResources)
      if (resource.locationId !== locationId)
        context.addIssue({
          code: 'custom',
          path: [...resource.path],
          message:
            'Every bootstrap resource must belong to the manifest location.',
        });

    const assertUnique = (
      values: readonly string[],
      path: 'stations' | 'machines',
    ): void => {
      const seen = new Set<string>();
      values.forEach((value, index) => {
        if (seen.has(value))
          context.addIssue({
            code: 'custom',
            path: [path, index],
            message: `Duplicate bootstrap natural key: ${value}.`,
          });
        seen.add(value);
      });
    };

    assertUnique(
      manifest.stations.map((station) => station.kind),
      'stations',
    );
    assertUnique(
      manifest.machines.map(
        (machine) => `${machine.stationKind}\u0000${machine.label}`,
      ),
      'machines',
    );
  });

export const productionBootstrapInputSchema = z
  .object({
    manifest: productionBootstrapManifestSchema,
    dryRun: z.boolean(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const productionBootstrapResourceTypeSchema = z.enum([
  'location',
  'station',
  'machine',
  'scheduler_config',
]);

export const productionBootstrapResourceChangeSchema = z
  .object({
    resourceType: productionBootstrapResourceTypeSchema,
    naturalKey: z.string().min(1).max(500),
    outcome: z.enum(['created', 'updated', 'noop']),
    changedFields: z.array(z.string().min(1).max(200)),
  })
  .strict()
  .superRefine((change, context) => {
    if (change.outcome === 'noop' && change.changedFields.length !== 0)
      context.addIssue({
        code: 'custom',
        path: ['changedFields'],
        message: 'A no-op resource cannot report changed fields.',
      });
    if (change.outcome !== 'noop' && change.changedFields.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['changedFields'],
        message: 'A created or updated resource must report changed fields.',
      });
  });

export const productionBootstrapDestructiveRejectionSchema = z
  .object({
    resourceType: productionBootstrapResourceTypeSchema,
    naturalKey: z.string().min(1).max(500),
    outcome: z.literal('rejected'),
    code: z.enum([
      'destructive_resource_removal',
      'destructive_resource_deactivation',
      'natural_key_change',
    ]),
    message: z.string().min(1).max(500),
  })
  .strict();

const productionBootstrapSummarySchema = z
  .object({
    created: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    noop: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  })
  .strict();

const bootstrapResultFields = {
  mode: z.enum(['dry_run', 'apply']),
  configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
  operations: z.array(productionBootstrapResourceChangeSchema),
  summary: productionBootstrapSummarySchema,
  replayed: z.boolean(),
} as const;

const validateBootstrapSummary = (
  result: {
    operations: readonly z.infer<
      typeof productionBootstrapResourceChangeSchema
    >[];
    rejections: readonly z.infer<
      typeof productionBootstrapDestructiveRejectionSchema
    >[];
    summary: z.infer<typeof productionBootstrapSummarySchema>;
  },
  context: z.RefinementCtx,
): void => {
  const count = (outcome: 'created' | 'updated' | 'noop'): number =>
    result.operations.filter((operation) => operation.outcome === outcome)
      .length;
  const expected = {
    created: count('created'),
    updated: count('updated'),
    noop: count('noop'),
    rejected: result.rejections.length,
  };

  if (JSON.stringify(result.summary) !== JSON.stringify(expected))
    context.addIssue({
      code: 'custom',
      path: ['summary'],
      message: 'Bootstrap summary counts do not match its resource outcomes.',
    });
};

export const productionBootstrapConvergedResultSchema = z
  .object({
    ...bootstrapResultFields,
    status: z.literal('converged'),
    rejections: z
      .array(productionBootstrapDestructiveRejectionSchema)
      .length(0),
    applied: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    validateBootstrapSummary(result, context);
    if (result.applied !== (result.mode === 'apply'))
      context.addIssue({
        code: 'custom',
        path: ['applied'],
        message: 'Only a converged apply result may report applied=true.',
      });
  });

export const productionBootstrapRejectedResultSchema = z
  .object({
    ...bootstrapResultFields,
    status: z.literal('rejected'),
    rejections: z.array(productionBootstrapDestructiveRejectionSchema).min(1),
    applied: z.literal(false),
  })
  .strict()
  .superRefine(validateBootstrapSummary);

export const productionBootstrapResultSchema = z.discriminatedUnion('status', [
  productionBootstrapConvergedResultSchema,
  productionBootstrapRejectedResultSchema,
]);

export const productionMutationResultSchema = z
  .object({
    entityId: productionIdSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const productionStageCompletionConfirmationRequiredResultSchema = z
  .object({
    status: z.literal('confirmation_required'),
    stageRunId: productionIdSchema,
    stageVersion: z.number().int().positive(),
    code: z.literal('PULSE_BOUNDARY_NOT_REACHED'),
    message: z.string().min(1),
    confirmation: productionStageTimingConfirmationSchema,
    timing: productionStageCompletionTimingSchema,
    replayed: z.literal(false),
  })
  .strict();

export const productionStageStartConfirmationRequiredResultSchema = z
  .object({
    status: z.literal('confirmation_required'),
    stageRunId: productionIdSchema,
    stageVersion: z.number().int().positive(),
    code: z.literal('PLANNED_START_NOT_REACHED'),
    message: z.string().min(1),
    confirmation: productionStageTimingConfirmationSchema,
    timing: productionStageStartTimingSchema,
    replayed: z.literal(false),
  })
  .strict();

export const advanceProductionStageResultSchema = z.union([
  productionMutationResultSchema,
  productionStageStartConfirmationRequiredResultSchema,
  productionStageCompletionConfirmationRequiredResultSchema,
]);

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

export const productionBatchMembershipMutationResultSchema = z
  .object({
    productionRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    queueVersion: z.number().int().positive(),
    batchVersion: z.number().int().positive(),
    membership: productionBatchMembershipSchema,
    replayed: z.boolean(),
  })
  .strict();

const productionPlacementCommittedFields = {
  status: z.literal('placed'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  productionBatchId: productionIdSchema,
  createdBatch: z.boolean(),
  affectedBatchIds: z.array(productionIdSchema).min(1),
  queueVersion: z.number().int().positive(),
  proposalHash: productionHashSchema,
  plannedCompletionAt: utcIsoStringSchema,
  overtimeMinutes: z.number().int().nonnegative(),
  replayed: z.boolean(),
} as const;

export const productionOrderPlacedResultSchema = z
  .object(productionPlacementCommittedFields)
  .strict();

const productionPlacementConfirmationFields = {
  status: z.literal('confirmation_required'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  target: productionPlacementTargetSchema,
  affectedBatchIds: z.array(productionIdSchema),
  queueVersion: z.number().int().positive(),
  proposalHash: productionHashSchema,
  projectedCompletionAt: utcIsoStringSchema,
  overtimeMinutes: z.number().int().positive(),
  replayed: z.literal(false),
} as const;

export const productionOrderPlacementConfirmationRequiredResultSchema = z
  .object(productionPlacementConfirmationFields)
  .strict();

const productionPlacementNotPlacedFields = {
  status: z.literal('not_placed'),
  mode: productionPlacementModeSchema,
  productionRunId: productionIdSchema,
  productionOrderId: productionIdSchema,
  reason: productionPlacementFailureReasonSchema,
  message: z.string().min(1),
  queueVersion: z.number().int().positive(),
  replayed: z.boolean(),
} as const;

export const productionOrderNotPlacedResultSchema = z
  .object(productionPlacementNotPlacedFields)
  .strict();

export const productionOrderPlacementResultSchema = z.discriminatedUnion(
  'status',
  [
    productionOrderPlacedResultSchema,
    productionOrderPlacementConfirmationRequiredResultSchema,
    productionOrderNotPlacedResultSchema,
  ],
);

export const automaticProductionOrderPlacementResultSchema =
  z.discriminatedUnion('status', [
    z
      .object({
        ...productionPlacementCommittedFields,
        mode: z.literal('automatic'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementConfirmationFields,
        mode: z.literal('automatic'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementNotPlacedFields,
        mode: z.literal('automatic'),
      })
      .strict(),
  ]);

export const exactProductionOrderPlacementResultSchema = z.discriminatedUnion(
  'status',
  [
    z
      .object({
        ...productionPlacementCommittedFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementConfirmationFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
    z
      .object({
        ...productionPlacementNotPlacedFields,
        mode: z.literal('manager_exact'),
      })
      .strict(),
  ],
);

export const confirmProductionOrderOvertimeResultSchema = z.discriminatedUnion(
  'status',
  [productionOrderPlacedResultSchema, productionOrderNotPlacedResultSchema],
);

export const acceptScheduleResultSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    acceptedAt: utcIsoStringSchema,
    replayed: z.boolean(),
  })
  .strict();

export const startScheduleResultSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionRunId: productionIdSchema,
    productionBatchIds: z.array(productionIdSchema),
    queueVersion: z.number().int().positive(),
    startedAt: utcIsoStringSchema,
    replayed: z.boolean(),
  })
  .strict();
