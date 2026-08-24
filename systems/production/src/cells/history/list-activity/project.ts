import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { ListProductionHistoryActivityResult } from '../../../read-models/production-history/contract.ts';
import type {
  HistoryActivityDetails,
  HistoryActivityEntry,
  HistoryActivityEntityType,
  HistoryActivityEventType,
  HistoryActivityOrderRouteReason,
  HistoryActivityPage,
  HistoryActivityPersistenceRow,
  HistoryActivityResolutionReason,
  HistoryActivityResolutionState,
  HistoryActivityStageKind,
} from './types.ts';
import {
  historyActivityEntityTypes,
  historyActivityEventTypes,
  historyActivityOrderRouteReasons,
  historyActivityResolutionReasons,
  historyActivityResolutionStates,
  historyActivityStageKinds,
} from './types.ts';

const systemActorId = '00000000-0000-4000-8000-000000000000';
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isMember = <Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value =>
  typeof value === 'string' && values.includes(value as Value);

const asRecord = (value: unknown): JsonObject =>
  isJsonObject(value) ? value : {};

const stringValue = (record: JsonObject, key: string): string | null =>
  typeof record[key] === 'string' && (record[key] as string).length > 0
    ? (record[key] as string)
    : null;

const idValue = (record: JsonObject, key: string): string | null => {
  const value = stringValue(record, key);
  return value !== null && uuidPattern.test(value) ? value : null;
};

const numberValue = (record: JsonObject, key: string): number | null =>
  typeof record[key] === 'number' && Number.isFinite(record[key])
    ? (record[key] as number)
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
  typeof record[key] === 'boolean' ? (record[key] as boolean) : null;

const idArray = (record: JsonObject, key: string): readonly string[] =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((value) =>
        typeof value === 'string' && uuidPattern.test(value) ? [value] : [],
      )
    : [];

const stringArray = (record: JsonObject, key: string): readonly string[] =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((value) =>
        typeof value === 'string' && value.length > 0 ? [value] : [],
      )
    : [];

const routeReasonValue = (
  record: JsonObject,
  key: string,
): HistoryActivityOrderRouteReason | null =>
  isMember(historyActivityOrderRouteReasons, record[key]) ? record[key] : null;

const resolutionStateValue = (
  record: JsonObject,
  key: string,
): HistoryActivityResolutionState | null =>
  isMember(historyActivityResolutionStates, record[key]) ? record[key] : null;

const resolutionReasonValue = (
  record: JsonObject,
  key: string,
): HistoryActivityResolutionReason | null =>
  isMember(historyActivityResolutionReasons, record[key]) ? record[key] : null;

const stageValue = (
  record: JsonObject,
  key: string,
): HistoryActivityStageKind | null =>
  isMember(historyActivityStageKinds, record[key]) ? record[key] : null;

const stageArray = (
  record: JsonObject,
  key: string,
): readonly HistoryActivityStageKind[] =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).filter(
        (value): value is HistoryActivityStageKind =>
          isMember(historyActivityStageKinds, value),
      )
    : [];

const summaries: Readonly<Record<HistoryActivityEventType, string>> = {
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
  eventType: HistoryActivityEventType,
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
  row: HistoryActivityPersistenceRow,
  resolvedProductionRunId: string | null = row.resolvedProductionRunId,
): HistoryActivityEntry | null => {
  if (
    !isMember(historyActivityEventTypes, row.eventType) ||
    !isMember(historyActivityEntityTypes, row.entityType)
  )
    return null;

  const eventType: HistoryActivityEventType = row.eventType;
  const entityType: HistoryActivityEntityType = row.entityType;
  const payload = asRecord(row.payload);
  const payloadRunId = idValue(payload, 'productionRunId');
  const productionRunId =
    resolvedProductionRunId ??
    (entityType === 'production_run' ? row.entityId : payloadRunId);
  const resolutionAction =
    (eventType === 'production_order_resolved_without_production' ||
      eventType === 'production_order_bulk_resolved_without_production') &&
    row.currentResolutionState === 'resolved_without_production' &&
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

const copyDetails = (details: HistoryActivityDetails) => {
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

export const projectHistoryActivityResult = (
  page: HistoryActivityPage,
): ListProductionHistoryActivityResult => ({
  items: page.items.map((entry) => ({
    ...entry,
    details: copyDetails(entry.details),
    occurredAt: entry.occurredAt.toISOString(),
  })),
  nextCursor: page.nextCursor,
  asOf: page.asOf.toISOString(),
});
