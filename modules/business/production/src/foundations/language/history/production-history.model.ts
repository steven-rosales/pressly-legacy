export const productionHistoryRunStatuses = ['started', 'completed'] as const;
export type ProductionHistoryCursorPoint = Readonly<{
  createdAtKey: string;
  id: string;
}>;

export type ProductionHistoryRunStatus =
  (typeof productionHistoryRunStatuses)[number];

export const productionHistoryPlanStatuses = [
  'draft',
  'accepted',
  'superseded',
  'rejected',
] as const;
export type ProductionHistoryPlanStatus =
  (typeof productionHistoryPlanStatuses)[number];

export const productionHistoryEntityTypes = [
  'order_demand',
  'production_resource_manifest',
  'scheduler_config',
  'production_shift',
  'schedule_run',
  'production_run',
  'production_order',
  'production_batch',
  'stage_run',
] as const;
export type ProductionHistoryEntityType =
  (typeof productionHistoryEntityTypes)[number];

export const productionHistoryEventTypes = [
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
  'production_order_resolved_without_production',
  'production_order_restored',
  'production_order_bulk_resolved_without_production',
  'production_order_rebatched',
  'production_order_route_exception_recorded',
  'batch_membership_frozen',
  'batch_membership_unfrozen',
  'machine_assigned',
  'stage_started',
  'stage_completed',
  'batch_progress_reconciled',
] as const;
export type ProductionHistoryEventType =
  (typeof productionHistoryEventTypes)[number];

export const productionHistoryStageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;
export type ProductionHistoryStageKind =
  (typeof productionHistoryStageKinds)[number];

export type ProductionHistoryStageBoundaryProvenance =
  | 'live_observed'
  | 'operator_reported'
  | 'not_recorded';

export type ProductionHistoryOrderStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';

export type ProductionHistoryPlacementProvenance =
  | 'initial_schedule'
  | 'automatic'
  | 'manager_exact'
  | 'manual_rebatch'
  | 'exception_route';

export const productionHistoryOrderRouteReasons = [
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
] as const;
export type ProductionHistoryOrderRouteReason =
  (typeof productionHistoryOrderRouteReasons)[number];

export const productionHistoryResolutionStates = [
  'open',
  'resolved_without_production',
] as const;
export type ProductionHistoryResolutionState =
  (typeof productionHistoryResolutionStates)[number];

export const productionHistoryResolutionReasons = [
  'completed_outside_pressly',
  'processor_not_in_use',
  'duplicate_or_test',
  'order_will_not_be_produced',
  'manager_correction',
  'work_should_be_produced',
  'other',
] as const;
export type ProductionHistoryResolutionReason =
  (typeof productionHistoryResolutionReasons)[number];

export type ProductionHistoryPage<Item> = Readonly<{
  items: readonly Item[];
  nextCursor: string | null;
  asOf: Date;
}>;

export type ProductionHistoryRunSummary = Readonly<{
  productionRunId: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: ProductionHistoryRunStatus;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  timezone: string;
  startedAt: Date;
  completedAt: Date | null;
  plannedCompletionAt: Date;
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
  queueVersion: number;
  overtimeAcknowledged: boolean;
  createdAt: Date;
}>;

export type ProductionHistoryPlanSummary = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  linkedProductionRunId: string | null;
  status: ProductionHistoryPlanStatus;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  algorithmVersion: string;
  schedulerConfigId: string;
  inputSnapshotHash: string;
  outputPlanHash: string;
  pulseCapacityLbs: number;
  batchCount: number;
  makespanMinutes: number;
  plannedCompletionAt: Date;
  warningCount: number;
  acknowledgedWarningCount: number;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  supersededAt: Date | null;
}>;

export type ProductionHistoryActor = Readonly<{
  id: string;
  kind: 'user' | 'system' | 'unknown';
  displayName: string | null;
}>;

export type ProductionHistoryActivityDetails =
  | Readonly<{ kind: 'demand'; outcome: string | null }>
  | Readonly<{ kind: 'configuration'; version: number | null }>
  | Readonly<{
      kind: 'shift';
      changedFields: readonly string[];
      supersededScheduleRunId: string | null;
    }>
  | Readonly<{
      kind: 'schedule';
      productionShiftId: string | null;
      inputSnapshotHash: string | null;
      outputPlanHash: string | null;
      acknowledgedWarningCount: number | null;
    }>
  | Readonly<{
      kind: 'run';
      scheduleRunId: string | null;
      batchCount: number | null;
      queueVersion: number | null;
    }>
  | Readonly<{
      kind: 'order';
      productionRunId: string | null;
      sourceBatchId: string | null;
      targetBatchId: string | null;
      outcome: string | null;
      bagCount: number | null;
      priority: boolean | null;
      queueVersion: number | null;
      version: number | null;
      resolutionState: ProductionHistoryResolutionState | null;
      resolutionReason: ProductionHistoryResolutionReason | null;
      routeReason: ProductionHistoryOrderRouteReason | null;
      restartStage: ProductionHistoryStageKind | null;
      releasedStages: readonly ProductionHistoryStageKind[];
      assignedStages: readonly ProductionHistoryStageKind[];
    }>
  | Readonly<{
      kind: 'batch';
      action: string;
      queueVersion: number | null;
      batchVersion: number | null;
      currentMilestone: string | null;
      targetMilestone: string | null;
      reason: string | null;
    }>
  | Readonly<{
      kind: 'stage';
      action: 'assigned' | 'started' | 'completed';
      version: number | null;
      machineIds: readonly string[];
      timingConfirmationRecorded: boolean;
    }>;

export type ProductionHistoryActivityEntry = Readonly<{
  id: string;
  eventType: ProductionHistoryEventType;
  entityType: ProductionHistoryEntityType;
  entityId: string;
  actor: ProductionHistoryActor;
  expectedVersion: number | null;
  productionRunId: string | null;
  resolutionAction: Readonly<{
    action: 'restore';
    expectedVersion: number;
  }> | null;
  summary: string;
  details: ProductionHistoryActivityDetails;
  occurredAt: Date;
}>;

export type ProductionHistoryBatchSummary = Readonly<{
  productionBatchId: string;
  sequence: number;
  status:
    | 'queued'
    | 'sorting'
    | 'washing'
    | 'drying'
    | 'folding_packaging'
    | 'finished';
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  currentOrderCount: number;
  historicalOrderCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}>;

export type ProductionHistoryStageProgress = Readonly<{
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  stage: ProductionHistoryStageKind;
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: ProductionHistoryStageBoundaryProvenance;
  actualEndProvenance: ProductionHistoryStageBoundaryProvenance;
  startedBy: string | null;
  completedBy: string | null;
  machineCount: number;
}>;

export type ProductionHistoryOrderMembership = Readonly<{
  membershipId: string;
  productionOrderId: string;
  externalOrderId: string;
  orderStatus: ProductionHistoryOrderStatus;
  derivedWeightLbs: number;
  bagCount: number | null;
  productionBatchId: string;
  batchSequence: number;
  placementProvenance: ProductionHistoryPlacementProvenance;
  placement:
    | Readonly<{
        state: 'current';
        placedAt: Date;
        placedBy: string | null;
      }>
    | Readonly<{
        state: 'released';
        placedAt: Date;
        placedBy: string | null;
        releasedAt: Date | null;
        releasedBy: string | null;
        reason: string | null;
      }>;
}>;

export type ProductionHistoryRunDetail = Readonly<{
  overview: ProductionHistoryRunSummary;
  batches: readonly ProductionHistoryBatchSummary[];
  orderMemberships: readonly ProductionHistoryOrderMembership[];
  stageProgress: Readonly<{
    planned: number;
    started: number;
    completed: number;
    items: readonly ProductionHistoryStageProgress[];
  }>;
  scheduleLineage: Readonly<{
    executionScheduleRunId: string;
    revisions: readonly ProductionHistoryPlanSummary[];
  }>;
  activity: Readonly<{
    items: readonly ProductionHistoryActivityEntry[];
    hasMore: boolean;
  }>;
  asOf: Date;
}>;

export type ProductionHistoryPageReadResult<Value> =
  | Readonly<{ tag: 'found'; value: Value }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'invalid_cursor' }>;

export type ProductionHistoryRunReadResult =
  | Readonly<{ tag: 'found'; value: ProductionHistoryRunDetail }>
  | Readonly<{ tag: 'location_not_found' }>
  | Readonly<{ tag: 'run_not_found' }>;
