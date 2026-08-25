import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { ProductionHistoryRunDetail } from '../../../read-models/production-history/contract.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  HistoryActivity,
  HistoryActivityDetails,
  HistoryActivityRow,
  HistoryBatch,
  HistoryBatchRow,
  HistoryEntityType,
  HistoryEventType,
  HistoryMembership,
  HistoryMembershipRow,
  HistoryOrderRouteReason,
  HistoryOrderStatus,
  HistoryPlacementProvenance,
  HistoryPlan,
  HistoryPlanRow,
  HistoryResolutionReason,
  HistoryResolutionState,
  HistoryRun,
  HistoryRunDetail,
  HistoryRunRow,
  HistoryRunStatistics,
  HistoryStage,
  HistoryStageKind,
  HistoryStageRow,
} from './types.ts';

export const historyEntityTypes = Object.freeze([
  'order_demand',
  'production_resource_manifest',
  'scheduler_config',
  'production_shift',
  'schedule_run',
  'production_run',
  'production_order',
  'production_batch',
  'stage_run',
] as const);

export const historyEventTypes = Object.freeze([
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
] as const);

const routeReasons = Object.freeze([
  'manual_rebatch',
  'needs_more_drying',
  'rewash_required',
  'sorting_incomplete',
  'stage_incomplete',
  'other',
] as const);
const resolutionStates = Object.freeze([
  'open',
  'resolved_without_production',
] as const);
const resolutionReasons = Object.freeze([
  'completed_outside_pressly',
  'processor_not_in_use',
  'duplicate_or_test',
  'order_will_not_be_produced',
  'manager_correction',
  'work_should_be_produced',
  'other',
] as const);
const stageKinds = Object.freeze([
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const);
const systemActorId = '00000000-0000-4000-8000-000000000000';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const isMember = <Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value =>
  typeof value === 'string' && values.includes(value as Value);

const asRecord = (value: unknown): JsonObject =>
  isJsonObject(value) ? value : {};
const stringValue = (record: JsonObject, key: string): string | null =>
  typeof record[key] === 'string' && record[key].length > 0
    ? record[key]
    : null;
const idValue = (record: JsonObject, key: string): string | null => {
  const value = stringValue(record, key);
  return value !== null && uuidPattern.test(value) ? value : null;
};
const numberValue = (record: JsonObject, key: string): number | null =>
  typeof record[key] === 'number' && Number.isFinite(record[key])
    ? record[key]
    : null;
const positiveVersion = (record: JsonObject, key: string): number | null => {
  const value = numberValue(record, key);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
};
const nonnegativeInteger = (record: JsonObject, key: string): number | null => {
  const value = numberValue(record, key);
  return value !== null && Number.isInteger(value) && value >= 0 ? value : null;
};
const booleanValue = (record: JsonObject, key: string): boolean | null =>
  typeof record[key] === 'boolean' ? record[key] : null;
const idArray = (record: JsonObject, key: string): readonly string[] =>
  Array.isArray(record[key])
    ? record[key].flatMap((value) =>
        typeof value === 'string' && uuidPattern.test(value) ? [value] : [],
      )
    : [];
const stringArray = (record: JsonObject, key: string): readonly string[] =>
  Array.isArray(record[key])
    ? record[key].flatMap((value) =>
        typeof value === 'string' && value.length > 0 ? [value] : [],
      )
    : [];
const routeReasonValue = (
  record: JsonObject,
  key: string,
): HistoryOrderRouteReason | null =>
  isMember(routeReasons, record[key]) ? record[key] : null;
const resolutionStateValue = (
  record: JsonObject,
  key: string,
): HistoryResolutionState | null =>
  isMember(resolutionStates, record[key]) ? record[key] : null;
const resolutionReasonValue = (
  record: JsonObject,
  key: string,
): HistoryResolutionReason | null =>
  isMember(resolutionReasons, record[key]) ? record[key] : null;
const stageValue = (
  record: JsonObject,
  key: string,
): HistoryStageKind | null =>
  isMember(stageKinds, record[key]) ? record[key] : null;
const stageArray = (
  record: JsonObject,
  key: string,
): readonly HistoryStageKind[] =>
  Array.isArray(record[key])
    ? record[key].filter((value): value is HistoryStageKind =>
        isMember(stageKinds, value),
      )
    : [];

export const emptyHistoryRunStatistics = (): HistoryRunStatistics => ({
  batchCount: 0,
  completedBatchCount: 0,
  orderCount: 0,
  priorityOrderCount: 0,
  totalWeightLbs: 0,
});

export const projectHistoryRun = (
  row: HistoryRunRow,
  statistics: HistoryRunStatistics,
): HistoryRun => {
  if (row.status !== 'started' && row.status !== 'completed')
    throw invariant(
      'production_history_run_status_invalid',
      `Unknown production-run history status: ${row.status}.`,
    );
  if (row.startedAt === null)
    throw invariant(
      'production_history_run_start_missing',
      'Production-run history is missing its start boundary.',
    );
  return {
    productionRunId: row.id,
    productionShiftId: row.productionShiftId,
    scheduleRunId: row.scheduleRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    timezone: row.timezone,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    plannedCompletionAt: row.plannedCompletionAt,
    ...statistics,
    queueVersion: row.queueVersion,
    overtimeAcknowledged: row.overtimeAcknowledgedAt !== null,
    createdAt: row.createdAt,
  };
};

export const projectHistoryBatch = (row: HistoryBatchRow): HistoryBatch => {
  if (
    row.status !== 'queued' &&
    row.status !== 'sorting' &&
    row.status !== 'washing' &&
    row.status !== 'drying' &&
    row.status !== 'folding_packaging' &&
    row.status !== 'finished'
  )
    throw invariant(
      'production_history_batch_status_invalid',
      `Unknown production-batch history status: ${row.status}.`,
    );
  return {
    productionBatchId: row.id,
    sequence: row.sequence,
    status: row.status,
    derivedWeightLbs: row.derivedWeightLbs,
    pulseCapacityLbs: row.pulseCapacityLbs,
    currentOrderCount: Number(row.currentOrderCount),
    historicalOrderCount: Number(row.historicalOrderCount),
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
};

export const projectHistoryStage = (row: HistoryStageRow): HistoryStage => {
  if (
    row.status !== 'planned' &&
    row.status !== 'started' &&
    row.status !== 'completed'
  )
    throw invariant(
      'production_history_stage_status_invalid',
      `Unknown stage-run history status: ${row.status}.`,
    );
  if (!isMember(stageKinds, row.stage))
    throw invariant(
      'production_history_stage_kind_invalid',
      `Unknown stage-run history kind: ${row.stage}.`,
    );
  return {
    stageRunId: row.stageRunId,
    productionBatchId: row.productionBatchId,
    batchSequence: row.batchSequence,
    stage: row.stage,
    status: row.status,
    plannedStartAt: row.plannedStartAt,
    plannedEndAt: row.plannedEndAt,
    actualStartAt: row.actualStartAt,
    actualEndAt: row.actualEndAt,
    actualStartProvenance: row.actualStartProvenance,
    actualEndProvenance: row.actualEndProvenance,
    startedBy: row.startedBy,
    completedBy: row.completedBy,
    machineCount: Number(row.machineCount),
  };
};

const orderStatus = (value: string): HistoryOrderStatus => {
  if (
    value === 'release_pending' ||
    value === 'intake_pending' ||
    value === 'eligible' ||
    value === 'ineligible' ||
    value === 'scheduled' ||
    value === 'finished'
  )
    return value;
  throw invariant(
    'production_history_order_status_invalid',
    `Unknown production-order history status: ${value}.`,
  );
};

const placementProvenance = (value: string): HistoryPlacementProvenance => {
  if (
    value === 'initial_schedule' ||
    value === 'automatic' ||
    value === 'manager_exact' ||
    value === 'manual_rebatch' ||
    value === 'exception_route'
  )
    return value;
  throw invariant(
    'production_history_placement_provenance_invalid',
    `Unknown production-order placement provenance: ${value}.`,
  );
};

export const projectHistoryMembership = (
  row: HistoryMembershipRow,
): HistoryMembership => {
  const shared = {
    membershipId: row.membershipId,
    productionOrderId: row.productionOrderId,
    externalOrderId: row.externalOrderId,
    orderStatus: orderStatus(row.orderStatus),
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    productionBatchId: row.productionBatchId,
    batchSequence: row.batchSequence,
    placementProvenance: placementProvenance(row.placementProvenance),
  } as const;
  if (row.active) {
    if (
      row.releasedAt !== null ||
      row.releasedBy !== null ||
      row.releaseReason !== null
    )
      throw invariant(
        'production_history_current_membership_release_metadata_invalid',
        'Current production-order membership has release metadata.',
      );
    return {
      ...shared,
      placement: {
        state: 'current',
        placedAt: row.placedAt,
        placedBy: row.placedBy,
      },
    };
  }
  const releaseMetadata = [row.releasedAt, row.releasedBy, row.releaseReason];
  if (
    !releaseMetadata.every((value) => value === null) &&
    !releaseMetadata.every((value) => value !== null)
  )
    throw invariant(
      'production_history_released_membership_metadata_incomplete',
      'Released production-order membership has partial release metadata.',
    );
  return {
    ...shared,
    placement: {
      state: 'released',
      placedAt: row.placedAt,
      placedBy: row.placedBy,
      releasedAt: row.releasedAt,
      releasedBy: row.releasedBy,
      reason: row.releaseReason,
    },
  };
};

export const projectHistoryPlan = (row: HistoryPlanRow): HistoryPlan => {
  if (
    row.status !== 'draft' &&
    row.status !== 'accepted' &&
    row.status !== 'superseded' &&
    row.status !== 'rejected'
  )
    throw invariant(
      'production_history_schedule_status_invalid',
      `Unknown schedule history status: ${row.status}.`,
    );
  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    linkedProductionRunId: row.linkedProductionRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt,
    shiftEndsAt: row.shiftEndsAt,
    algorithmVersion: row.algorithmVersion,
    schedulerConfigId: row.schedulerConfigId,
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: row.plannedCompletionAt,
    warningCount: Array.isArray(row.warnings) ? row.warnings.length : 0,
    acknowledgedWarningCount: Array.isArray(row.acknowledgedWarningCodes)
      ? row.acknowledgedWarningCodes.length
      : 0,
    createdAt: row.createdAt,
    acceptedAt: row.acceptedAt,
    acceptedBy: row.acceptedBy,
    supersededAt: row.supersededAt,
  };
};

const summaries: Readonly<Record<HistoryEventType, string>> = {
  order_demand_applied: 'Order demand synchronized',
  production_resources_bootstrapped: 'Production resources configured',
  scheduler_config_published: 'Scheduler configuration published',
  production_shift_created: 'Production shift created',
  production_shift_updated: 'Production shift updated',
  schedule_computed: 'Schedule plan computed',
  schedule_accepted: 'Schedule plan accepted',
  production_run_started: 'Production run started',
  production_order_priority_changed: 'Order priority changed',
  production_order_intake_recorded: 'Order intake recorded',
  production_order_placement_pending: 'Order placement deferred',
  production_order_placement_overtime_required:
    'Order placement requires overtime confirmation',
  production_order_placement_resolved: 'Order placement resolved',
  production_order_resolved_without_production:
    'Order archived from active work',
  production_order_restored: 'Order restored to active work',
  production_order_bulk_resolved_without_production:
    'Order archived from active work',
  production_order_rebatched: 'Order moved to another queued batch',
  production_order_route_exception_recorded:
    'Order left its batch for later production',
  batch_membership_frozen: 'Batch membership frozen',
  batch_membership_unfrozen: 'Batch membership unfrozen',
  machine_assigned: 'Stage machines assigned',
  stage_started: 'Production stage started',
  stage_completed: 'Production stage completed',
  batch_progress_reconciled: 'Batch floor progress reconciled',
};

const activityDetails = (
  eventType: HistoryEventType,
  payload: JsonObject,
): HistoryActivityDetails => {
  switch (eventType) {
    case 'order_demand_applied':
      return { kind: 'demand', outcome: stringValue(payload, 'outcome') };
    case 'production_resources_bootstrapped':
    case 'scheduler_config_published':
      return {
        kind: 'configuration',
        version: positiveVersion(payload, 'version'),
      };
    case 'production_shift_created':
    case 'production_shift_updated':
      return {
        kind: 'shift',
        changedFields: stringArray(payload, 'changedFields'),
        supersededScheduleRunId: idValue(payload, 'supersededScheduleRunId'),
      };
    case 'schedule_computed':
    case 'schedule_accepted':
      return {
        kind: 'schedule',
        productionShiftId: idValue(payload, 'productionShiftId'),
        inputSnapshotHash: stringValue(payload, 'inputSnapshotHash'),
        outputPlanHash: stringValue(payload, 'outputPlanHash'),
        acknowledgedWarningCount: Array.isArray(
          payload['acknowledgedWarningCodes'],
        )
          ? payload['acknowledgedWarningCodes'].length
          : null,
      };
    case 'production_run_started':
      return {
        kind: 'run',
        scheduleRunId: idValue(payload, 'scheduleRunId'),
        batchCount: Array.isArray(payload['productionBatchIds'])
          ? payload['productionBatchIds'].length
          : null,
        queueVersion: positiveVersion(payload, 'queueVersion'),
      };
    case 'production_order_priority_changed':
    case 'production_order_intake_recorded':
    case 'production_order_placement_pending':
    case 'production_order_placement_overtime_required':
    case 'production_order_placement_resolved':
    case 'production_order_resolved_without_production':
    case 'production_order_restored':
    case 'production_order_bulk_resolved_without_production':
    case 'production_order_rebatched':
    case 'production_order_route_exception_recorded':
      return {
        kind: 'order',
        productionRunId: idValue(payload, 'productionRunId'),
        sourceBatchId:
          idValue(payload, 'sourceProductionBatchId') ??
          idValue(payload, 'sourceBatchId'),
        targetBatchId:
          idValue(payload, 'targetProductionBatchId') ??
          idValue(payload, 'targetBatchId'),
        outcome:
          stringValue(payload, 'outcome') ?? stringValue(payload, 'action'),
        bagCount: nonnegativeInteger(payload, 'bagCount'),
        priority: booleanValue(payload, 'priority'),
        queueVersion: positiveVersion(payload, 'queueVersion'),
        version: positiveVersion(payload, 'version'),
        resolutionState: resolutionStateValue(payload, 'resolutionState'),
        resolutionReason: resolutionReasonValue(payload, 'reason'),
        routeReason: routeReasonValue(payload, 'reason'),
        restartStage: stageValue(payload, 'restartStage'),
        releasedStages: stageArray(payload, 'releasedStages'),
        assignedStages: stageArray(payload, 'assignedStages'),
      };
    case 'batch_membership_frozen':
    case 'batch_membership_unfrozen':
    case 'batch_progress_reconciled':
      return {
        kind: 'batch',
        action:
          stringValue(payload, 'action') ??
          (eventType === 'batch_progress_reconciled'
            ? 'progress_reconciled'
            : eventType === 'batch_membership_frozen'
              ? 'frozen'
              : 'unfrozen'),
        queueVersion: positiveVersion(payload, 'queueVersion'),
        batchVersion: positiveVersion(payload, 'batchVersion'),
        currentMilestone: stringValue(payload, 'currentMilestone'),
        targetMilestone: stringValue(payload, 'targetMilestone'),
        reason: stringValue(payload, 'reason'),
      };
    case 'machine_assigned':
    case 'stage_started':
    case 'stage_completed':
      return {
        kind: 'stage',
        action:
          eventType === 'machine_assigned'
            ? 'assigned'
            : eventType === 'stage_started'
              ? 'started'
              : 'completed',
        version: positiveVersion(payload, 'version'),
        machineIds: idArray(payload, 'machineIds'),
        timingConfirmationRecorded:
          payload['earlyStart'] !== undefined ||
          payload['earlyCompletion'] !== undefined,
      };
  }
};

export const projectHistoryActivity = (
  row: HistoryActivityRow,
  resolvedProductionRunId: string | null = null,
): HistoryActivity | null => {
  if (
    !isMember(historyEventTypes, row.eventType) ||
    !isMember(historyEntityTypes, row.entityType)
  )
    return null;
  const eventType: HistoryEventType = row.eventType;
  const entityType: HistoryEntityType = row.entityType;
  const payload = asRecord(row.payload);
  const payloadRunId = idValue(payload, 'productionRunId');
  const productionRunId =
    resolvedProductionRunId ??
    (entityType === 'production_run' ? row.entityId : payloadRunId);
  const resolutionAction =
    (eventType === 'production_order_resolved_without_production' ||
      eventType === 'production_order_bulk_resolved_without_production') &&
    row.currentResolutionState === 'resolved_without_production' &&
    row.currentProductionVersion !== undefined &&
    row.currentProductionVersion !== null &&
    Number.isInteger(row.currentProductionVersion) &&
    row.currentProductionVersion > 0
      ? {
          action: 'restore' as const,
          expectedVersion: row.currentProductionVersion,
        }
      : null;
  return {
    id: row.id,
    eventType,
    entityType,
    entityId: row.entityId,
    actor:
      row.actorId === systemActorId
        ? { id: row.actorId, kind: 'system', displayName: 'System' }
        : row.actorDisplayName === null ||
            row.actorDisplayName.trim().length === 0
          ? { id: row.actorId, kind: 'unknown', displayName: null }
          : {
              id: row.actorId,
              kind: 'user',
              displayName: row.actorDisplayName.trim(),
            },
    expectedVersion: row.expectedVersion,
    productionRunId,
    resolutionAction,
    summary: summaries[eventType],
    details: activityDetails(eventType, payload),
    occurredAt: row.createdAt,
  };
};

const activityDetailsResult = (details: HistoryActivityDetails) => {
  switch (details.kind) {
    case 'shift':
      return { ...details, changedFields: [...details.changedFields] };
    case 'order':
      return {
        ...details,
        releasedStages: [...details.releasedStages],
        assignedStages: [...details.assignedStages],
      };
    case 'stage':
      return { ...details, machineIds: [...details.machineIds] };
    case 'batch':
    case 'configuration':
    case 'demand':
    case 'run':
    case 'schedule':
      return { ...details };
  }
};

export const projectHistoryRunDetailResult = (
  detail: HistoryRunDetail,
): ProductionHistoryRunDetail => ({
  overview: {
    ...detail.overview,
    shiftStartsAt: detail.overview.shiftStartsAt.toISOString(),
    shiftEndsAt: detail.overview.shiftEndsAt.toISOString(),
    startedAt: detail.overview.startedAt.toISOString(),
    completedAt: detail.overview.completedAt?.toISOString() ?? null,
    plannedCompletionAt: detail.overview.plannedCompletionAt.toISOString(),
    createdAt: detail.overview.createdAt.toISOString(),
  },
  batches: detail.batches.map((batch) => ({
    ...batch,
    startedAt: batch.startedAt?.toISOString() ?? null,
    finishedAt: batch.finishedAt?.toISOString() ?? null,
  })),
  orderMemberships: detail.orderMemberships.map((membership) => ({
    ...membership,
    placement:
      membership.placement.state === 'current'
        ? {
            ...membership.placement,
            placedAt: membership.placement.placedAt.toISOString(),
          }
        : {
            ...membership.placement,
            placedAt: membership.placement.placedAt.toISOString(),
            releasedAt: membership.placement.releasedAt?.toISOString() ?? null,
          },
  })),
  stageProgress: {
    ...detail.stageProgress,
    items: detail.stageProgress.items.map((stage) => ({
      ...stage,
      plannedStartAt: stage.plannedStartAt.toISOString(),
      plannedEndAt: stage.plannedEndAt.toISOString(),
      actualStartAt: stage.actualStartAt?.toISOString() ?? null,
      actualEndAt: stage.actualEndAt?.toISOString() ?? null,
    })),
  },
  scheduleLineage: {
    ...detail.scheduleLineage,
    revisions: detail.scheduleLineage.revisions.map((plan) => ({
      ...plan,
      shiftStartsAt: plan.shiftStartsAt.toISOString(),
      shiftEndsAt: plan.shiftEndsAt.toISOString(),
      plannedCompletionAt: plan.plannedCompletionAt.toISOString(),
      createdAt: plan.createdAt.toISOString(),
      acceptedAt: plan.acceptedAt?.toISOString() ?? null,
      supersededAt: plan.supersededAt?.toISOString() ?? null,
    })),
  },
  activity: {
    ...detail.activity,
    items: detail.activity.items.map((activity) => ({
      ...activity,
      details: activityDetailsResult(activity.details),
      occurredAt: activity.occurredAt.toISOString(),
    })),
  },
  asOf: detail.asOf.toISOString(),
});
