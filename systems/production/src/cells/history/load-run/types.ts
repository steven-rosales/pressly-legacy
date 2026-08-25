export const loadHistoryRunOperationId =
  'production.load-history-run.v1' as const;

export type LoadHistoryRunInput = Readonly<{
  locationId: string;
  productionRunId: string;
}>;

export type HistoryRunStatus = 'started' | 'completed';
export type HistoryPlanStatus =
  | 'draft'
  | 'accepted'
  | 'superseded'
  | 'rejected';
export type HistoryStageKind =
  | 'sorting'
  | 'washing'
  | 'drying'
  | 'folding_packaging';
export type HistoryStageBoundaryProvenance =
  | 'live_observed'
  | 'operator_reported'
  | 'not_recorded';
export type HistoryOrderStatus =
  | 'release_pending'
  | 'intake_pending'
  | 'eligible'
  | 'ineligible'
  | 'scheduled'
  | 'finished';
export type HistoryPlacementProvenance =
  | 'initial_schedule'
  | 'automatic'
  | 'manager_exact'
  | 'manual_rebatch'
  | 'exception_route';
export type HistoryEntityType =
  | 'order_demand'
  | 'production_resource_manifest'
  | 'scheduler_config'
  | 'production_shift'
  | 'schedule_run'
  | 'production_run'
  | 'production_order'
  | 'production_batch'
  | 'stage_run';
export type HistoryEventType =
  | 'order_demand_applied'
  | 'production_resources_bootstrapped'
  | 'scheduler_config_published'
  | 'production_shift_created'
  | 'production_shift_updated'
  | 'schedule_computed'
  | 'schedule_accepted'
  | 'production_run_started'
  | 'production_order_priority_changed'
  | 'production_order_intake_recorded'
  | 'production_order_placement_pending'
  | 'production_order_placement_overtime_required'
  | 'production_order_placement_resolved'
  | 'production_order_resolved_without_production'
  | 'production_order_restored'
  | 'production_order_bulk_resolved_without_production'
  | 'production_order_rebatched'
  | 'production_order_route_exception_recorded'
  | 'batch_membership_frozen'
  | 'batch_membership_unfrozen'
  | 'machine_assigned'
  | 'stage_started'
  | 'stage_completed'
  | 'batch_progress_reconciled';
export type HistoryOrderRouteReason =
  | 'manual_rebatch'
  | 'needs_more_drying'
  | 'rewash_required'
  | 'sorting_incomplete'
  | 'stage_incomplete'
  | 'other';
export type HistoryResolutionState = 'open' | 'resolved_without_production';
export type HistoryResolutionReason =
  | 'completed_outside_pressly'
  | 'processor_not_in_use'
  | 'duplicate_or_test'
  | 'order_will_not_be_produced'
  | 'manager_correction'
  | 'work_should_be_produced'
  | 'other';

export type HistoryRunStatistics = Readonly<{
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
}>;

export type HistoryRunRow = Readonly<{
  id: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: string;
  shiftStartsAt: Date;
  shiftEndsAt: Date;
  timezone: string;
  startedAt: Date | null;
  completedAt: Date | null;
  plannedCompletionAt: Date;
  queueVersion: number;
  overtimeAcknowledgedAt: Date | null;
  createdAt: Date;
}>;

export type HistoryBatchRow = Readonly<{
  id: string;
  sequence: number;
  status: string;
  derivedWeightLbs: number;
  pulseCapacityLbs: number;
  currentOrderCount: number;
  historicalOrderCount: number;
  startedAt: Date | null;
  finishedAt: Date | null;
}>;

export type HistoryMembershipRow = Readonly<{
  membershipId: string;
  productionOrderId: string;
  externalOrderId: string;
  orderStatus: string;
  derivedWeightLbs: number;
  bagCount: number | null;
  productionBatchId: string;
  batchSequence: number;
  placementProvenance: string;
  active: boolean;
  placedAt: Date;
  placedBy: string | null;
  releasedAt: Date | null;
  releasedBy: string | null;
  releaseReason: string | null;
}>;

export type HistoryStageRow = Readonly<{
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  stage: string;
  status: string;
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: HistoryStageBoundaryProvenance;
  actualEndProvenance: HistoryStageBoundaryProvenance;
  startedBy: string | null;
  completedBy: string | null;
  machineCount: number;
}>;

export type HistoryPlanRow = Readonly<{
  id: string;
  productionShiftId: string;
  linkedProductionRunId: string | null;
  status: string;
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
  warnings: unknown;
  acknowledgedWarningCodes: unknown;
  createdAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null;
  supersededAt: Date | null;
}>;

export type HistoryActivityRow = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorDisplayName: string | null;
  expectedVersion: number | null;
  payload: unknown;
  currentResolutionState?: string | null;
  currentProductionVersion?: number | null;
  createdAt: Date;
}>;

export type HistoryRun = Readonly<{
  productionRunId: string;
  productionShiftId: string;
  scheduleRunId: string;
  status: HistoryRunStatus;
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

export type HistoryBatch = Readonly<{
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

export type HistoryMembership = Readonly<{
  membershipId: string;
  productionOrderId: string;
  externalOrderId: string;
  orderStatus: HistoryOrderStatus;
  derivedWeightLbs: number;
  bagCount: number | null;
  productionBatchId: string;
  batchSequence: number;
  placementProvenance: HistoryPlacementProvenance;
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

export type HistoryStage = Readonly<{
  stageRunId: string;
  productionBatchId: string;
  batchSequence: number;
  stage: HistoryStageKind;
  status: 'planned' | 'started' | 'completed';
  plannedStartAt: Date;
  plannedEndAt: Date;
  actualStartAt: Date | null;
  actualEndAt: Date | null;
  actualStartProvenance: HistoryStageBoundaryProvenance;
  actualEndProvenance: HistoryStageBoundaryProvenance;
  startedBy: string | null;
  completedBy: string | null;
  machineCount: number;
}>;

export type HistoryPlan = Readonly<{
  scheduleRunId: string;
  productionShiftId: string;
  linkedProductionRunId: string | null;
  status: HistoryPlanStatus;
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

export type HistoryActor = Readonly<{
  id: string;
  kind: 'user' | 'system' | 'unknown';
  displayName: string | null;
}>;

export type HistoryActivityDetails =
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
      resolutionState: HistoryResolutionState | null;
      resolutionReason: HistoryResolutionReason | null;
      routeReason: HistoryOrderRouteReason | null;
      restartStage: HistoryStageKind | null;
      releasedStages: readonly HistoryStageKind[];
      assignedStages: readonly HistoryStageKind[];
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

export type HistoryActivity = Readonly<{
  id: string;
  eventType: HistoryEventType;
  entityType: HistoryEntityType;
  entityId: string;
  actor: HistoryActor;
  expectedVersion: number | null;
  productionRunId: string | null;
  resolutionAction: Readonly<{
    action: 'restore';
    expectedVersion: number;
  }> | null;
  summary: string;
  details: HistoryActivityDetails;
  occurredAt: Date;
}>;

export type HistoryRunDetail = Readonly<{
  overview: HistoryRun;
  batches: readonly HistoryBatch[];
  orderMemberships: readonly HistoryMembership[];
  stageProgress: Readonly<{
    planned: number;
    started: number;
    completed: number;
    items: readonly HistoryStage[];
  }>;
  scheduleLineage: Readonly<{
    executionScheduleRunId: string;
    revisions: readonly HistoryPlan[];
  }>;
  activity: Readonly<{
    items: readonly HistoryActivity[];
    hasMore: boolean;
  }>;
  asOf: Date;
}>;

export type LoadHistoryRunRepositoryResult =
  | Readonly<{ kind: 'found'; detail: HistoryRunDetail }>
  | Readonly<{ kind: 'location_not_found' }>
  | Readonly<{ kind: 'run_not_found' }>;

export type LoadHistoryRunRepository = Readonly<{
  load: (
    input: LoadHistoryRunInput,
    asOf: Date,
  ) => Promise<LoadHistoryRunRepositoryResult>;
}>;

export type LoadHistoryRunClock = Readonly<{ now: () => Date }>;

export type LoadHistoryRunLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;

export type LoadHistoryRunNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_history_run_not_found';
  message: 'The production run was not found at this location.';
  safeMessage: 'The production run was not found at this location.';
}>;

export type LoadHistoryRunExpectedFailure =
  | LoadHistoryRunLocationNotFound
  | LoadHistoryRunNotFound;
