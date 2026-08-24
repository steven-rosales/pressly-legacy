export const listHistoryActivityOperationId =
  'production.list-history-activity.v1' as const;

export const historyActivityEntityTypes = [
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

export type HistoryActivityEntityType =
  (typeof historyActivityEntityTypes)[number];

export const historyActivityEventTypes = [
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

export type HistoryActivityEventType =
  (typeof historyActivityEventTypes)[number];

export const historyActivityStageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

export type HistoryActivityStageKind =
  (typeof historyActivityStageKinds)[number];

export const historyActivityOrderRouteReasons = [
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
] as const;

export type HistoryActivityOrderRouteReason =
  (typeof historyActivityOrderRouteReasons)[number];

export const historyActivityResolutionStates = [
  'open',
  'resolved_without_production',
] as const;

export type HistoryActivityResolutionState =
  (typeof historyActivityResolutionStates)[number];

export const historyActivityResolutionReasons = [
  'completed_outside_pressly',
  'processor_not_in_use',
  'duplicate_or_test',
  'order_will_not_be_produced',
  'manager_correction',
  'work_should_be_produced',
  'other',
] as const;

export type HistoryActivityResolutionReason =
  (typeof historyActivityResolutionReasons)[number];

export type ListHistoryActivityInput = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  runId?: string;
  entityType?: HistoryActivityEntityType;
  eventType?: HistoryActivityEventType;
  orderResolution?: 'archived' | 'restored';
  search?: string;
  occurredAfter?: Date;
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
      resolutionState: HistoryActivityResolutionState | null;
      resolutionReason: HistoryActivityResolutionReason | null;
      routeReason: HistoryActivityOrderRouteReason | null;
      restartStage: HistoryActivityStageKind | null;
      releasedStages: readonly HistoryActivityStageKind[];
      assignedStages: readonly HistoryActivityStageKind[];
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

export type HistoryActivityEntry = Readonly<{
  id: string;
  eventType: HistoryActivityEventType;
  entityType: HistoryActivityEntityType;
  entityId: string;
  actor: Readonly<{
    id: string;
    kind: 'user' | 'system' | 'unknown';
    displayName: string | null;
  }>;
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

export type HistoryActivityPersistenceRow = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorDisplayName: string | null;
  expectedVersion: number | null;
  payload: unknown;
  currentResolutionState: string | null;
  currentProductionVersion: number | null;
  createdAt: Date;
  cursorCreatedAtKey: string;
  resolvedProductionRunId: string | null;
}>;

export type HistoryActivityPage = Readonly<{
  items: readonly HistoryActivityEntry[];
  nextCursor: string | null;
  asOf: Date;
}>;

export type ListHistoryActivityRepositoryResult =
  | Readonly<{ kind: 'found'; page: HistoryActivityPage }>
  | Readonly<{ kind: 'location_not_found' }>
  | Readonly<{ kind: 'invalid_cursor' }>;

export type ListHistoryActivityRepository = Readonly<{
  list: (
    input: ListHistoryActivityInput,
    asOf: Date,
  ) => Promise<ListHistoryActivityRepositoryResult>;
}>;

export type ListHistoryActivityClock = Readonly<{ now: () => Date }>;

export type ListHistoryActivityLocationNotFound = Readonly<{
  tag: 'ProductionFailure';
  kind: 'not_found';
  code: 'production_location_not_found';
  message: 'The production location was not found.';
  safeMessage: 'The production location was not found.';
}>;

export type ListHistoryActivityCursorInvalid = Readonly<{
  tag: 'ProductionFailure';
  kind: 'validation';
  classification: 'malformed';
  code: 'production_history_cursor_invalid';
  message: 'The production-history cursor is invalid for these filters.';
  safeMessage: 'The production-history cursor is invalid for these filters.';
}>;

export type ListHistoryActivityExpectedFailure =
  | ListHistoryActivityLocationNotFound
  | ListHistoryActivityCursorInvalid;
