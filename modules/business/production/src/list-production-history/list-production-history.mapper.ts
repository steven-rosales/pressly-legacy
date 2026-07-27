import {
  productionHistoryEntityTypeSchema,
  productionHistoryEventTypeSchema,
  productionIdSchema,
  productionOrderResolutionReasonSchema,
  productionOrderResolutionStateSchema,
  productionOrderRestorationReasonSchema,
  productionOrderRouteReasonSchema,
  productionStageKindSchema,
  type ListProductionHistoryActivityQuery,
  type ListProductionHistoryPlansQuery,
  type ListProductionHistoryRunsQuery,
  type ProductionHistoryActivityEntry,
  type ProductionHistoryPlanSummary,
  type ProductionHistoryRunSummary,
  type ProductionOrderRouteReason,
} from '@pressly/contracts';

export type ProductionHistoryCursorKind = 'runs' | 'activity' | 'plans';

export type ProductionHistoryCursorPoint = Readonly<{
  createdAt: Date;
  id: string;
}>;

type EncodedHistoryCursor = Readonly<{
  version: 1;
  kind: ProductionHistoryCursorKind;
  filterKey: string;
  createdAt: string;
  id: string;
}>;

export const productionHistoryFilterKey = (
  kind: ProductionHistoryCursorKind,
  query:
    | ListProductionHistoryActivityQuery
    | ListProductionHistoryPlansQuery
    | ListProductionHistoryRunsQuery,
): string => {
  if (kind === 'activity') {
    const activity = query as ListProductionHistoryActivityQuery;
    return JSON.stringify({
      runId: activity.runId ?? null,
      entityType: activity.entityType ?? null,
      eventType: activity.eventType ?? null,
      orderResolution: activity.orderResolution ?? null,
      search: activity.search ?? null,
      occurredAfter: activity.occurredAfter ?? null,
    });
  }
  if (kind === 'plans') {
    const plans = query as ListProductionHistoryPlansQuery;
    return JSON.stringify({
      runId: plans.runId ?? null,
      search: plans.search ?? null,
      status: plans.status ?? null,
      createdAfter: plans.createdAfter ?? null,
    });
  }
  const runs = query as ListProductionHistoryRunsQuery;
  return JSON.stringify({
    search: runs.search ?? null,
    status: runs.status ?? null,
    createdAfter: runs.createdAfter ?? null,
  });
};

export const encodeProductionHistoryCursor = (
  kind: ProductionHistoryCursorKind,
  filterKey: string,
  point: ProductionHistoryCursorPoint,
): string =>
  Buffer.from(
    JSON.stringify({
      version: 1,
      kind,
      filterKey,
      createdAt: point.createdAt.toISOString(),
      id: productionIdSchema.parse(point.id),
    } satisfies EncodedHistoryCursor),
    'utf8',
  ).toString('base64url');

export const decodeProductionHistoryCursor = (
  cursor: string,
  kind: ProductionHistoryCursorKind,
  filterKey: string,
): ProductionHistoryCursorPoint | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<EncodedHistoryCursor>;
    if (
      parsed.version !== 1 ||
      parsed.kind !== kind ||
      parsed.filterKey !== filterKey ||
      typeof parsed.createdAt !== 'string' ||
      !productionIdSchema.safeParse(parsed.id).success
    )
      return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isFinite(createdAt.getTime())
      ? { createdAt, id: parsed.id as string }
      : null;
  } catch {
    return null;
  }
};

export type ProductionHistoryRunRow = Readonly<{
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

export type ProductionHistoryRunStatistics = Readonly<{
  batchCount: number;
  completedBatchCount: number;
  orderCount: number;
  priorityOrderCount: number;
  totalWeightLbs: number;
}>;

export const mapProductionHistoryRun = (
  row: ProductionHistoryRunRow,
  statistics: ProductionHistoryRunStatistics,
): ProductionHistoryRunSummary => {
  if (row.status !== 'started' && row.status !== 'completed')
    throw new Error(`Unknown production-run history status: ${row.status}.`);
  if (row.startedAt === null)
    throw new Error('Production-run history is missing its start boundary.');

  return {
    productionRunId: row.id,
    productionShiftId: row.productionShiftId,
    scheduleRunId: row.scheduleRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt.toISOString(),
    shiftEndsAt: row.shiftEndsAt.toISOString(),
    timezone: row.timezone,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
    ...statistics,
    queueVersion: row.queueVersion,
    overtimeAcknowledged: row.overtimeAcknowledgedAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
};

export type ProductionHistoryPlanRow = Readonly<{
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

const arrayLength = (value: unknown): number =>
  Array.isArray(value) ? value.length : 0;

export const mapProductionHistoryPlan = (
  row: ProductionHistoryPlanRow,
): ProductionHistoryPlanSummary => {
  if (
    row.status !== 'draft' &&
    row.status !== 'accepted' &&
    row.status !== 'superseded' &&
    row.status !== 'rejected'
  )
    throw new Error(`Unknown schedule history status: ${row.status}.`);

  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    linkedProductionRunId: row.linkedProductionRunId,
    status: row.status,
    shiftStartsAt: row.shiftStartsAt.toISOString(),
    shiftEndsAt: row.shiftEndsAt.toISOString(),
    algorithmVersion: row.algorithmVersion,
    schedulerConfigId: row.schedulerConfigId,
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
    warningCount: arrayLength(row.warnings),
    acknowledgedWarningCount: arrayLength(row.acknowledgedWarningCodes),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    supersededAt: row.supersededAt?.toISOString() ?? null,
  };
};

export type ProductionHistoryActivityRow = Readonly<{
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  actorDisplayName: string | null;
  expectedVersion: number | null;
  payload: unknown;
  createdAt: Date;
  currentResolutionState?: string | null;
  currentProductionVersion?: number | null;
}>;

const systemActorId = '00000000-0000-4000-8000-000000000000';

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};

const stringValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null =>
  typeof record[key] === 'string' && (record[key] as string).length > 0
    ? (record[key] as string)
    : null;

const idValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | null => {
  const value = stringValue(record, key);
  return productionIdSchema.safeParse(value).success ? value : null;
};

const numberValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null =>
  typeof record[key] === 'number' && Number.isFinite(record[key])
    ? (record[key] as number)
    : null;

const positiveVersion = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null => {
  const value = numberValue(record, key);
  return value !== null && Number.isInteger(value) && value > 0 ? value : null;
};

const nonnegativeInteger = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): number | null => {
  const value = numberValue(record, key);
  return value !== null && Number.isInteger(value) && value >= 0 ? value : null;
};

const booleanValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean | null =>
  typeof record[key] === 'boolean' ? (record[key] as boolean) : null;

const idArray = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string[] =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((value) =>
        productionIdSchema.safeParse(value).success ? [value as string] : [],
      )
    : [];

const stringArray = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): string[] =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((value) =>
        typeof value === 'string' && value.length > 0 ? [value] : [],
      )
    : [];

const routeReasonValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
): ProductionOrderRouteReason | null => {
  const parsed = productionOrderRouteReasonSchema.safeParse(record[key]);
  return parsed.success ? parsed.data : null;
};

const resolutionStateValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
) => {
  const parsed = productionOrderResolutionStateSchema.safeParse(record[key]);
  return parsed.success ? parsed.data : null;
};

const resolutionReasonValue = (
  record: Readonly<Record<string, unknown>>,
  key: string,
) => {
  const resolution = productionOrderResolutionReasonSchema.safeParse(
    record[key],
  );
  if (resolution.success) return resolution.data;
  const restoration = productionOrderRestorationReasonSchema.safeParse(
    record[key],
  );
  return restoration.success ? restoration.data : null;
};

const stageValue = (record: Readonly<Record<string, unknown>>, key: string) => {
  const parsed = productionStageKindSchema.safeParse(record[key]);
  return parsed.success ? parsed.data : null;
};

const stageArray = (record: Readonly<Record<string, unknown>>, key: string) =>
  Array.isArray(record[key])
    ? (record[key] as unknown[]).flatMap((value) => {
        const parsed = productionStageKindSchema.safeParse(value);
        return parsed.success ? [parsed.data] : [];
      })
    : [];

const summaries: Readonly<Record<string, string>> = {
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
  eventType: ProductionHistoryActivityEntry['eventType'],
  payload: Readonly<Record<string, unknown>>,
): ProductionHistoryActivityEntry['details'] => {
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

export const mapProductionHistoryActivity = (
  row: ProductionHistoryActivityRow,
  resolvedProductionRunId: string | null = null,
): ProductionHistoryActivityEntry | null => {
  const eventType = productionHistoryEventTypeSchema.safeParse(row.eventType);
  const entityType = productionHistoryEntityTypeSchema.safeParse(
    row.entityType,
  );
  if (!eventType.success || !entityType.success) return null;

  const payload = asRecord(row.payload);
  const payloadRunId = idValue(payload, 'productionRunId');
  const productionRunId =
    resolvedProductionRunId ??
    (entityType.data === 'production_run' ? row.entityId : payloadRunId);
  const resolutionAction =
    (eventType.data === 'production_order_resolved_without_production' ||
      eventType.data === 'production_order_bulk_resolved_without_production') &&
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
    eventType: eventType.data,
    entityType: entityType.data,
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
    summary: summaries[eventType.data] as string,
    details: activityDetails(eventType.data, payload),
    occurredAt: row.createdAt.toISOString(),
  };
};
