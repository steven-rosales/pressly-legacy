import {
  productionHistoryEventTypeSchema,
  type ProductionHistoryBatchSummary,
  type ProductionHistoryOrderMembership,
  type ProductionHistoryRunDetail,
  type ProductionHistoryStageProgress,
} from '@pressly/contracts';
import {
  and,
  auth,
  desc,
  eq,
  gte,
  inArray,
  laundryProduction,
  lt,
  or,
  sql,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import {
  decodeProductionHistoryCursor,
  encodeProductionHistoryCursor,
  mapProductionHistoryActivity,
  mapProductionHistoryPlan,
  mapProductionHistoryRun,
  productionHistoryFilterKey,
  type ProductionHistoryCursorPoint,
  type ProductionHistoryPlanRow,
  type ProductionHistoryRunStatistics,
} from './list-production-history.mapper.ts';
import type {
  ListProductionHistoryActivityCommand,
  ListProductionHistoryPlansCommand,
  ListProductionHistoryRunsCommand,
  LoadProductionHistoryRunCommand,
  ProductionHistoryRepository,
} from './list-production-history.port.ts';

const locationExists = async (
  db: DatabaseExecutor,
  locationId: string,
): Promise<boolean> => {
  const [location] = await db
    .select({ id: laundryProduction.productionLocations.id })
    .from(laundryProduction.productionLocations)
    .where(eq(laundryProduction.productionLocations.id, locationId))
    .limit(1);
  return location !== undefined;
};

const emptyRunStatistics = (): ProductionHistoryRunStatistics => ({
  batchCount: 0,
  completedBatchCount: 0,
  orderCount: 0,
  priorityOrderCount: 0,
  totalWeightLbs: 0,
});

const loadRunStatistics = async (
  db: DatabaseExecutor,
  runIds: readonly string[],
): Promise<Map<string, ProductionHistoryRunStatistics>> => {
  if (runIds.length === 0) return new Map();

  const [batchRows, orderRows] = await Promise.all([
    db
      .select({
        productionRunId: laundryProduction.productionBatches.productionRunId,
        batchCount: sql<number>`count(*)`,
        completedBatchCount: sql<number>`count(*) filter (where ${laundryProduction.productionBatches.status} = 'finished')`,
        totalWeightLbs: sql<number>`coalesce(sum(${laundryProduction.productionBatches.derivedWeightLbs}), 0)`,
      })
      .from(laundryProduction.productionBatches)
      .where(
        inArray(laundryProduction.productionBatches.productionRunId, [
          ...runIds,
        ]),
      )
      .groupBy(laundryProduction.productionBatches.productionRunId),
    db
      .select({
        productionRunId: laundryProduction.productionBatches.productionRunId,
        orderCount: sql<number>`count(distinct ${laundryProduction.productionBatchOrders.productionOrderId})`,
        priorityOrderCount: sql<number>`count(distinct ${laundryProduction.productionBatchOrders.productionOrderId}) filter (where ${laundryProduction.productionOrders.priority} = true)`,
      })
      .from(laundryProduction.productionBatchOrders)
      .innerJoin(
        laundryProduction.productionBatches,
        and(
          eq(
            laundryProduction.productionBatches.id,
            laundryProduction.productionBatchOrders.productionBatchId,
          ),
          eq(
            laundryProduction.productionBatches.locationId,
            laundryProduction.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        laundryProduction.productionOrders,
        and(
          eq(
            laundryProduction.productionOrders.id,
            laundryProduction.productionBatchOrders.productionOrderId,
          ),
          eq(
            laundryProduction.productionOrders.locationId,
            laundryProduction.productionBatchOrders.locationId,
          ),
        ),
      )
      .where(
        inArray(laundryProduction.productionBatches.productionRunId, [
          ...runIds,
        ]),
      )
      .groupBy(laundryProduction.productionBatches.productionRunId),
  ]);

  const statistics = new Map<string, ProductionHistoryRunStatistics>();
  for (const row of batchRows)
    statistics.set(row.productionRunId, {
      ...emptyRunStatistics(),
      batchCount: Number(row.batchCount),
      completedBatchCount: Number(row.completedBatchCount),
      totalWeightLbs: Number(row.totalWeightLbs),
    });
  for (const row of orderRows) {
    const current = statistics.get(row.productionRunId) ?? emptyRunStatistics();
    statistics.set(row.productionRunId, {
      ...current,
      orderCount: Number(row.orderCount),
      priorityOrderCount: Number(row.priorityOrderCount),
    });
  }
  return statistics;
};

const runPageRows = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryRunsCommand,
  cursor: ProductionHistoryCursorPoint | undefined,
) =>
  db
    .select({
      id: laundryProduction.productionRuns.id,
      productionShiftId: laundryProduction.productionRuns.productionShiftId,
      scheduleRunId: laundryProduction.productionRuns.scheduleRunId,
      status: laundryProduction.productionRuns.status,
      shiftStartsAt: laundryProduction.productionShifts.startsAt,
      shiftEndsAt: laundryProduction.productionShifts.endsAt,
      timezone: laundryProduction.productionShifts.timezone,
      startedAt: laundryProduction.productionRuns.startedAt,
      completedAt: laundryProduction.productionRuns.completedAt,
      plannedCompletionAt: laundryProduction.productionRuns.plannedCompletionAt,
      queueVersion: laundryProduction.productionRuns.queueVersion,
      overtimeAcknowledgedAt:
        laundryProduction.productionRuns.overtimeAcknowledgedAt,
      createdAt: laundryProduction.productionRuns.createdAt,
    })
    .from(laundryProduction.productionRuns)
    .innerJoin(
      laundryProduction.productionShifts,
      and(
        eq(
          laundryProduction.productionShifts.id,
          laundryProduction.productionRuns.productionShiftId,
        ),
        eq(
          laundryProduction.productionShifts.locationId,
          laundryProduction.productionRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, command.locationId),
        command.status === undefined
          ? undefined
          : eq(laundryProduction.productionRuns.status, command.status),
        command.createdAfter === undefined
          ? undefined
          : gte(
              laundryProduction.productionRuns.createdAt,
              new Date(command.createdAfter),
            ),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.productionRuns.id}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.productionRuns.productionShiftId}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.productionRuns.scheduleRunId}::text), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.productionRuns.createdAt, cursor.createdAt),
              and(
                eq(
                  laundryProduction.productionRuns.createdAt,
                  cursor.createdAt,
                ),
                lt(laundryProduction.productionRuns.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.productionRuns.createdAt),
      desc(laundryProduction.productionRuns.id),
    )
    .limit(command.limit + 1);

const listRuns = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryRunsCommand,
  now: Date,
) => {
  const filterKey = productionHistoryFilterKey('runs', command);
  const cursor =
    command.cursor === undefined
      ? undefined
      : decodeProductionHistoryCursor(command.cursor, 'runs', filterKey);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await locationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await runPageRows(db, command, cursor);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const statistics = await loadRunStatistics(
    db,
    pageRows.map((row) => row.id),
  );
  const last = pageRows.at(-1);
  return {
    tag: 'found' as const,
    value: {
      items: pageRows.map((row) =>
        mapProductionHistoryRun(
          row,
          statistics.get(row.id) ?? emptyRunStatistics(),
        ),
      ),
      nextCursor:
        hasNextPage && last !== undefined
          ? encodeProductionHistoryCursor('runs', filterKey, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now.toISOString(),
    },
  };
};

const planSelect = {
  id: laundryProduction.scheduleRuns.id,
  productionShiftId: laundryProduction.scheduleRuns.productionShiftId,
  linkedProductionRunId: laundryProduction.productionRuns.id,
  status: laundryProduction.scheduleRuns.status,
  shiftStartsAt: laundryProduction.productionShifts.startsAt,
  shiftEndsAt: laundryProduction.productionShifts.endsAt,
  algorithmVersion: laundryProduction.scheduleRuns.algorithmVersion,
  schedulerConfigId: laundryProduction.scheduleRuns.schedulerConfigId,
  inputSnapshotHash: laundryProduction.scheduleRuns.inputSnapshotHash,
  outputPlanHash: laundryProduction.scheduleRuns.outputPlanHash,
  pulseCapacityLbs: laundryProduction.scheduleRuns.pulseCapacityLbs,
  batchCount: laundryProduction.scheduleRuns.batchCount,
  makespanMinutes: laundryProduction.scheduleRuns.makespanMinutes,
  plannedCompletionAt: laundryProduction.scheduleRuns.plannedCompletionAt,
  warnings: laundryProduction.scheduleRuns.warnings,
  acknowledgedWarningCodes:
    laundryProduction.scheduleRuns.acknowledgedWarningCodes,
  createdAt: laundryProduction.scheduleRuns.createdAt,
  acceptedAt: laundryProduction.scheduleRuns.acceptedAt,
  acceptedBy: laundryProduction.scheduleRuns.acceptedBy,
  supersededAt: laundryProduction.scheduleRuns.supersededAt,
} as const;

const listPlans = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryPlansCommand,
  now: Date,
) => {
  const filterKey = productionHistoryFilterKey('plans', command);
  const cursor =
    command.cursor === undefined
      ? undefined
      : decodeProductionHistoryCursor(command.cursor, 'plans', filterKey);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await locationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await db
    .select(planSelect)
    .from(laundryProduction.scheduleRuns)
    .innerJoin(
      laundryProduction.productionShifts,
      and(
        eq(
          laundryProduction.productionShifts.id,
          laundryProduction.scheduleRuns.productionShiftId,
        ),
        eq(
          laundryProduction.productionShifts.locationId,
          laundryProduction.scheduleRuns.locationId,
        ),
      ),
    )
    .leftJoin(
      laundryProduction.productionRuns,
      and(
        eq(
          laundryProduction.productionRuns.scheduleRunId,
          laundryProduction.scheduleRuns.id,
        ),
        eq(
          laundryProduction.productionRuns.locationId,
          laundryProduction.scheduleRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.scheduleRuns.locationId, command.locationId),
        command.runId === undefined
          ? undefined
          : eq(laundryProduction.productionRuns.id, command.runId),
        command.status === undefined
          ? undefined
          : eq(laundryProduction.scheduleRuns.status, command.status),
        command.createdAfter === undefined
          ? undefined
          : gte(
              laundryProduction.scheduleRuns.createdAt,
              new Date(command.createdAfter),
            ),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.scheduleRuns.id}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.productionShiftId}::text), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.schedulerConfigId}::text), lower(${command.search})) > 0
              or strpos(lower(coalesce(${laundryProduction.productionRuns.id}::text, '')), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.scheduleRuns.algorithmVersion}), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.scheduleRuns.createdAt, cursor.createdAt),
              and(
                eq(laundryProduction.scheduleRuns.createdAt, cursor.createdAt),
                lt(laundryProduction.scheduleRuns.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.scheduleRuns.createdAt),
      desc(laundryProduction.scheduleRuns.id),
    )
    .limit(command.limit + 1);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const last = pageRows.at(-1);
  return {
    tag: 'found' as const,
    value: {
      items: pageRows.map((row) =>
        mapProductionHistoryPlan(row as ProductionHistoryPlanRow),
      ),
      nextCursor:
        hasNextPage && last !== undefined
          ? encodeProductionHistoryCursor('plans', filterKey, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now.toISOString(),
    },
  };
};

const runScopePredicate = (productionRunId: string) => sql<boolean>`(
  (${laundryProduction.workEvents.entityType} = 'production_run'
    and ${laundryProduction.workEvents.entityId} = ${productionRunId})
  or (${laundryProduction.workEvents.entityType} = 'production_batch'
    and exists (
      select 1 from production_batches as scoped_batch
      where scoped_batch.id = ${laundryProduction.workEvents.entityId}
        and scoped_batch.production_run_id = ${productionRunId}
    ))
  or (${laundryProduction.workEvents.entityType} = 'stage_run'
    and exists (
      select 1 from stage_runs as scoped_stage
      join production_batches as scoped_stage_batch
        on scoped_stage_batch.id = scoped_stage.production_batch_id
      where scoped_stage.id = ${laundryProduction.workEvents.entityId}
        and scoped_stage_batch.production_run_id = ${productionRunId}
    ))
  or (${laundryProduction.workEvents.entityType} = 'schedule_run'
    and exists (
      select 1 from production_runs as scoped_schedule_run
      where scoped_schedule_run.schedule_run_id = ${laundryProduction.workEvents.entityId}
        and scoped_schedule_run.id = ${productionRunId}
    ))
  or (${laundryProduction.workEvents.entityType} = 'production_shift'
    and exists (
      select 1 from production_runs as scoped_shift_run
      where scoped_shift_run.production_shift_id = ${laundryProduction.workEvents.entityId}
        and scoped_shift_run.id = ${productionRunId}
    ))
  or (${laundryProduction.workEvents.entityType} = 'production_order'
    and exists (
      select 1 from production_batch_orders as scoped_membership
      join production_batches as scoped_order_batch
        on scoped_order_batch.id = scoped_membership.production_batch_id
      where scoped_membership.production_order_id = ${laundryProduction.workEvents.entityId}
        and scoped_order_batch.production_run_id = ${productionRunId}
    ))
  or (${laundryProduction.workEvents.entityType} = 'order_demand'
    and exists (
      select 1 from production_orders as scoped_order
      join production_batch_orders as scoped_demand_membership
        on scoped_demand_membership.production_order_id = scoped_order.id
      join production_batches as scoped_demand_batch
        on scoped_demand_batch.id = scoped_demand_membership.production_batch_id
      where scoped_order.order_demand_id = ${laundryProduction.workEvents.entityId}
        and scoped_demand_batch.production_run_id = ${productionRunId}
    ))
)`;

const resolvedProductionRunId = sql<string | null>`case
  when ${laundryProduction.workEvents.entityType} = 'production_run'
    then ${laundryProduction.workEvents.entityId}
  when ${laundryProduction.workEvents.entityType} = 'production_batch'
    then (
      select resolved_batch.production_run_id
      from production_batches as resolved_batch
      where resolved_batch.id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'stage_run'
    then (
      select resolved_stage_batch.production_run_id
      from stage_runs as resolved_stage
      join production_batches as resolved_stage_batch
        on resolved_stage_batch.id = resolved_stage.production_batch_id
      where resolved_stage.id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'schedule_run'
    then (
      select resolved_schedule_run.id
      from production_runs as resolved_schedule_run
      where resolved_schedule_run.schedule_run_id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'production_shift'
    then (
      select resolved_shift_run.id
      from production_runs as resolved_shift_run
      where resolved_shift_run.production_shift_id = ${laundryProduction.workEvents.entityId}
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'production_order'
    then (
      select resolved_order_batch.production_run_id
      from production_batch_orders as resolved_membership
      join production_batches as resolved_order_batch
        on resolved_order_batch.id = resolved_membership.production_batch_id
      where resolved_membership.production_order_id = ${laundryProduction.workEvents.entityId}
      order by resolved_order_batch.created_at desc, resolved_order_batch.id desc
      limit 1
    )
  when ${laundryProduction.workEvents.entityType} = 'order_demand'
    then (
      select resolved_demand_batch.production_run_id
      from production_orders as resolved_order
      join production_batch_orders as resolved_demand_membership
        on resolved_demand_membership.production_order_id = resolved_order.id
      join production_batches as resolved_demand_batch
        on resolved_demand_batch.id = resolved_demand_membership.production_batch_id
      where resolved_order.order_demand_id = ${laundryProduction.workEvents.entityId}
      order by resolved_demand_batch.created_at desc, resolved_demand_batch.id desc
      limit 1
    )
  else null
end`.as('resolved_production_run_id');

const listActivity = async (
  db: DatabaseExecutor,
  command: ListProductionHistoryActivityCommand,
  now: Date,
) => {
  const filterKey = productionHistoryFilterKey('activity', command);
  const cursor =
    command.cursor === undefined
      ? undefined
      : decodeProductionHistoryCursor(command.cursor, 'activity', filterKey);
  if (cursor === null) return { tag: 'invalid_cursor' as const };
  if (!(await locationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const rows = await db
    .select({
      id: laundryProduction.workEvents.id,
      eventType: laundryProduction.workEvents.eventType,
      entityType: laundryProduction.workEvents.entityType,
      entityId: laundryProduction.workEvents.entityId,
      actorId: laundryProduction.workEvents.actorId,
      actorDisplayName: auth.authIdentities.displayName,
      expectedVersion: laundryProduction.workEvents.expectedVersion,
      payload: laundryProduction.workEvents.payload,
      resolvedProductionRunId,
      createdAt: laundryProduction.workEvents.createdAt,
    })
    .from(laundryProduction.workEvents)
    .leftJoin(
      auth.authIdentities,
      eq(auth.authIdentities.id, laundryProduction.workEvents.actorId),
    )
    .where(
      and(
        eq(laundryProduction.workEvents.locationId, command.locationId),
        inArray(laundryProduction.workEvents.eventType, [
          ...productionHistoryEventTypeSchema.options,
        ]),
        command.entityType === undefined
          ? undefined
          : eq(laundryProduction.workEvents.entityType, command.entityType),
        command.eventType === undefined
          ? undefined
          : eq(laundryProduction.workEvents.eventType, command.eventType),
        command.runId === undefined
          ? undefined
          : runScopePredicate(command.runId),
        command.occurredAfter === undefined
          ? undefined
          : gte(
              laundryProduction.workEvents.createdAt,
              new Date(command.occurredAfter),
            ),
        command.search === undefined
          ? undefined
          : sql<boolean>`(
              strpos(lower(${laundryProduction.workEvents.eventType}), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.workEvents.entityType}), lower(${command.search})) > 0
              or strpos(lower(${laundryProduction.workEvents.entityId}::text), lower(${command.search})) > 0
              or strpos(lower(coalesce(${auth.authIdentities.displayName}, '')), lower(${command.search})) > 0
            )`,
        cursor === undefined
          ? undefined
          : or(
              lt(laundryProduction.workEvents.createdAt, cursor.createdAt),
              and(
                eq(laundryProduction.workEvents.createdAt, cursor.createdAt),
                lt(laundryProduction.workEvents.id, cursor.id),
              ),
            ),
      ),
    )
    .orderBy(
      desc(laundryProduction.workEvents.createdAt),
      desc(laundryProduction.workEvents.id),
    )
    .limit(command.limit + 1);
  const hasNextPage = rows.length > command.limit;
  const pageRows = rows.slice(0, command.limit);
  const last = pageRows.at(-1);
  return {
    tag: 'found' as const,
    value: {
      items: pageRows.flatMap((row) => {
        const mapped = mapProductionHistoryActivity(
          row,
          command.runId ?? row.resolvedProductionRunId,
        );
        return mapped === null ? [] : [mapped];
      }),
      nextCursor:
        hasNextPage && last !== undefined
          ? encodeProductionHistoryCursor('activity', filterKey, {
              createdAt: last.createdAt,
              id: last.id,
            })
          : null,
      asOf: now.toISOString(),
    },
  };
};

const mapBatchStatus = (
  status: string,
): ProductionHistoryBatchSummary['status'] => {
  switch (status) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return status;
    default:
      throw new Error(`Unknown production-batch history status: ${status}.`);
  }
};

const mapStageStatus = (
  status: string,
): ProductionHistoryStageProgress['status'] => {
  if (status === 'planned' || status === 'started' || status === 'completed')
    return status;
  throw new Error(`Unknown stage-run history status: ${status}.`);
};

const mapStageKind = (
  stage: string,
): ProductionHistoryStageProgress['stage'] => {
  if (
    stage === 'sorting' ||
    stage === 'washing' ||
    stage === 'drying' ||
    stage === 'folding_packaging'
  )
    return stage;
  throw new Error(`Unknown stage-run history kind: ${stage}.`);
};

const mapOrderStatus = (
  status: string,
): ProductionHistoryOrderMembership['orderStatus'] => {
  switch (status) {
    case 'intake_pending':
    case 'eligible':
    case 'ineligible':
    case 'scheduled':
    case 'finished':
      return status;
    default:
      throw new Error(`Unknown production-order history status: ${status}.`);
  }
};

const mapPlacementProvenance = (
  provenance: string,
): ProductionHistoryOrderMembership['placementProvenance'] => {
  switch (provenance) {
    case 'initial_schedule':
    case 'automatic':
    case 'manager_exact':
    case 'manual_rebatch':
    case 'exception_route':
      return provenance;
    default:
      throw new Error(
        `Unknown production-order placement provenance: ${provenance}.`,
      );
  }
};

type ProductionHistoryOrderMembershipRow = Readonly<{
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

const mapOrderMembership = (
  row: ProductionHistoryOrderMembershipRow,
): ProductionHistoryOrderMembership => {
  const shared = {
    membershipId: row.membershipId,
    productionOrderId: row.productionOrderId,
    externalOrderId: row.externalOrderId,
    orderStatus: mapOrderStatus(row.orderStatus),
    derivedWeightLbs: row.derivedWeightLbs,
    bagCount: row.bagCount,
    productionBatchId: row.productionBatchId,
    batchSequence: row.batchSequence,
    placementProvenance: mapPlacementProvenance(row.placementProvenance),
  } as const;

  if (row.active) {
    if (
      row.releasedAt !== null ||
      row.releasedBy !== null ||
      row.releaseReason !== null
    )
      throw new Error(
        'Current production-order membership has release metadata.',
      );
    return {
      ...shared,
      placement: {
        state: 'current',
        placedAt: row.placedAt.toISOString(),
        placedBy: row.placedBy,
      },
    };
  }

  const releaseMetadata = [row.releasedAt, row.releasedBy, row.releaseReason];
  if (
    !releaseMetadata.every((value) => value === null) &&
    !releaseMetadata.every((value) => value !== null)
  )
    throw new Error(
      'Released production-order membership has partial release metadata.',
    );
  return {
    ...shared,
    placement: {
      state: 'released',
      placedAt: row.placedAt.toISOString(),
      placedBy: row.placedBy,
      releasedAt: row.releasedAt?.toISOString() ?? null,
      releasedBy: row.releasedBy,
      reason: row.releaseReason,
    },
  };
};

const loadRun = async (
  db: DatabaseExecutor,
  command: LoadProductionHistoryRunCommand,
  now: Date,
) => {
  if (!(await locationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const [run] = await db
    .select({
      id: laundryProduction.productionRuns.id,
      productionShiftId: laundryProduction.productionRuns.productionShiftId,
      scheduleRunId: laundryProduction.productionRuns.scheduleRunId,
      status: laundryProduction.productionRuns.status,
      shiftStartsAt: laundryProduction.productionShifts.startsAt,
      shiftEndsAt: laundryProduction.productionShifts.endsAt,
      timezone: laundryProduction.productionShifts.timezone,
      startedAt: laundryProduction.productionRuns.startedAt,
      completedAt: laundryProduction.productionRuns.completedAt,
      plannedCompletionAt: laundryProduction.productionRuns.plannedCompletionAt,
      queueVersion: laundryProduction.productionRuns.queueVersion,
      overtimeAcknowledgedAt:
        laundryProduction.productionRuns.overtimeAcknowledgedAt,
      createdAt: laundryProduction.productionRuns.createdAt,
    })
    .from(laundryProduction.productionRuns)
    .innerJoin(
      laundryProduction.productionShifts,
      and(
        eq(
          laundryProduction.productionShifts.id,
          laundryProduction.productionRuns.productionShiftId,
        ),
        eq(
          laundryProduction.productionShifts.locationId,
          laundryProduction.productionRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, command.locationId),
        eq(laundryProduction.productionRuns.id, command.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) return { tag: 'run_not_found' as const };

  const [
    batchRows,
    membershipRows,
    stageRows,
    planRows,
    activityRows,
    statistics,
  ] = await Promise.all([
    db
      .select({
        id: laundryProduction.productionBatches.id,
        sequence: laundryProduction.productionBatches.sequenceIndex,
        status: laundryProduction.productionBatches.status,
        derivedWeightLbs: laundryProduction.productionBatches.derivedWeightLbs,
        pulseCapacityLbs: laundryProduction.productionBatches.pulseCapacityLbs,
        startedAt: laundryProduction.productionBatches.startedAt,
        finishedAt: laundryProduction.productionBatches.finishedAt,
        currentOrderCount: sql<number>`count(${laundryProduction.productionBatchOrders.productionOrderId}) filter (where ${laundryProduction.productionBatchOrders.active} = true)`,
        historicalOrderCount: sql<number>`count(${laundryProduction.productionBatchOrders.productionOrderId})`,
      })
      .from(laundryProduction.productionBatches)
      .leftJoin(
        laundryProduction.productionBatchOrders,
        and(
          eq(
            laundryProduction.productionBatchOrders.productionBatchId,
            laundryProduction.productionBatches.id,
          ),
          eq(
            laundryProduction.productionBatchOrders.locationId,
            laundryProduction.productionBatches.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(
            laundryProduction.productionBatches.locationId,
            command.locationId,
          ),
          eq(
            laundryProduction.productionBatches.productionRunId,
            command.productionRunId,
          ),
        ),
      )
      .groupBy(laundryProduction.productionBatches.id)
      .orderBy(laundryProduction.productionBatches.sequenceIndex),
    db
      .select({
        membershipId: laundryProduction.productionBatchOrders.id,
        productionOrderId:
          laundryProduction.productionBatchOrders.productionOrderId,
        externalOrderId: laundryProduction.orderDemands.displayReference,
        orderStatus: laundryProduction.productionOrders.status,
        derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
        bagCount: laundryProduction.productionOrders.bagCount,
        productionBatchId:
          laundryProduction.productionBatchOrders.productionBatchId,
        batchSequence: laundryProduction.productionBatches.sequenceIndex,
        placementProvenance:
          laundryProduction.productionBatchOrders.placementProvenance,
        active: laundryProduction.productionBatchOrders.active,
        placedAt: laundryProduction.productionBatchOrders.placedAt,
        placedBy: laundryProduction.productionBatchOrders.placedBy,
        releasedAt: laundryProduction.productionBatchOrders.releasedAt,
        releasedBy: laundryProduction.productionBatchOrders.releasedBy,
        releaseReason: laundryProduction.productionBatchOrders.releaseReason,
      })
      .from(laundryProduction.productionBatchOrders)
      .innerJoin(
        laundryProduction.productionBatches,
        and(
          eq(
            laundryProduction.productionBatches.id,
            laundryProduction.productionBatchOrders.productionBatchId,
          ),
          eq(
            laundryProduction.productionBatches.locationId,
            laundryProduction.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        laundryProduction.productionOrders,
        and(
          eq(
            laundryProduction.productionOrders.id,
            laundryProduction.productionBatchOrders.productionOrderId,
          ),
          eq(
            laundryProduction.productionOrders.locationId,
            laundryProduction.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        laundryProduction.orderDemands,
        and(
          eq(
            laundryProduction.orderDemands.id,
            laundryProduction.productionOrders.orderDemandId,
          ),
          eq(
            laundryProduction.orderDemands.locationId,
            laundryProduction.productionOrders.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(
            laundryProduction.productionBatchOrders.locationId,
            command.locationId,
          ),
          eq(
            laundryProduction.productionBatches.productionRunId,
            command.productionRunId,
          ),
        ),
      )
      .orderBy(
        laundryProduction.productionBatches.sequenceIndex,
        laundryProduction.productionBatchOrders.placedAt,
        laundryProduction.productionBatchOrders.id,
      ),
    db
      .select({
        stageRunId: laundryProduction.stageRuns.id,
        productionBatchId: laundryProduction.stageRuns.productionBatchId,
        batchSequence: laundryProduction.productionBatches.sequenceIndex,
        stage: laundryProduction.stageRuns.stageKind,
        status: laundryProduction.stageRuns.status,
        plannedStartAt: laundryProduction.stageRuns.plannedStartAt,
        plannedEndAt: laundryProduction.stageRuns.plannedEndAt,
        actualStartAt: laundryProduction.stageRuns.actualStartAt,
        actualEndAt: laundryProduction.stageRuns.actualEndAt,
        actualStartProvenance:
          laundryProduction.stageRuns.actualStartProvenance,
        actualEndProvenance: laundryProduction.stageRuns.actualEndProvenance,
        startedBy: laundryProduction.stageRuns.startedBy,
        completedBy: laundryProduction.stageRuns.completedBy,
        machineCount: sql<number>`count(${laundryProduction.stageMachineAssignments.id})`,
      })
      .from(laundryProduction.stageRuns)
      .innerJoin(
        laundryProduction.productionBatches,
        and(
          eq(
            laundryProduction.productionBatches.id,
            laundryProduction.stageRuns.productionBatchId,
          ),
          eq(
            laundryProduction.productionBatches.locationId,
            laundryProduction.stageRuns.locationId,
          ),
        ),
      )
      .leftJoin(
        laundryProduction.stageMachineAssignments,
        and(
          eq(
            laundryProduction.stageMachineAssignments.stageRunId,
            laundryProduction.stageRuns.id,
          ),
          eq(
            laundryProduction.stageMachineAssignments.locationId,
            laundryProduction.stageRuns.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.stageRuns.locationId, command.locationId),
          eq(
            laundryProduction.productionBatches.productionRunId,
            command.productionRunId,
          ),
        ),
      )
      .groupBy(
        laundryProduction.stageRuns.id,
        laundryProduction.productionBatches.sequenceIndex,
      )
      .orderBy(
        laundryProduction.productionBatches.sequenceIndex,
        laundryProduction.stageRuns.plannedStartAt,
      ),
    db
      .select(planSelect)
      .from(laundryProduction.scheduleRuns)
      .innerJoin(
        laundryProduction.productionShifts,
        and(
          eq(
            laundryProduction.productionShifts.id,
            laundryProduction.scheduleRuns.productionShiftId,
          ),
          eq(
            laundryProduction.productionShifts.locationId,
            laundryProduction.scheduleRuns.locationId,
          ),
        ),
      )
      .leftJoin(
        laundryProduction.productionRuns,
        and(
          eq(
            laundryProduction.productionRuns.scheduleRunId,
            laundryProduction.scheduleRuns.id,
          ),
          eq(
            laundryProduction.productionRuns.locationId,
            laundryProduction.scheduleRuns.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(laundryProduction.scheduleRuns.locationId, command.locationId),
          eq(
            laundryProduction.scheduleRuns.productionShiftId,
            run.productionShiftId,
          ),
        ),
      )
      .orderBy(
        desc(laundryProduction.scheduleRuns.createdAt),
        desc(laundryProduction.scheduleRuns.id),
      ),
    db
      .select({
        id: laundryProduction.workEvents.id,
        eventType: laundryProduction.workEvents.eventType,
        entityType: laundryProduction.workEvents.entityType,
        entityId: laundryProduction.workEvents.entityId,
        actorId: laundryProduction.workEvents.actorId,
        actorDisplayName: auth.authIdentities.displayName,
        expectedVersion: laundryProduction.workEvents.expectedVersion,
        payload: laundryProduction.workEvents.payload,
        createdAt: laundryProduction.workEvents.createdAt,
      })
      .from(laundryProduction.workEvents)
      .leftJoin(
        auth.authIdentities,
        eq(auth.authIdentities.id, laundryProduction.workEvents.actorId),
      )
      .where(
        and(
          eq(laundryProduction.workEvents.locationId, command.locationId),
          inArray(laundryProduction.workEvents.eventType, [
            ...productionHistoryEventTypeSchema.options,
          ]),
          runScopePredicate(command.productionRunId),
        ),
      )
      .orderBy(
        desc(laundryProduction.workEvents.createdAt),
        desc(laundryProduction.workEvents.id),
      )
      .limit(101),
    loadRunStatistics(db, [command.productionRunId]),
  ]);

  const stages: ProductionHistoryStageProgress[] = stageRows.map((stage) => ({
    stageRunId: stage.stageRunId,
    productionBatchId: stage.productionBatchId,
    batchSequence: stage.batchSequence,
    stage: mapStageKind(stage.stage),
    status: mapStageStatus(stage.status),
    plannedStartAt: stage.plannedStartAt.toISOString(),
    plannedEndAt: stage.plannedEndAt.toISOString(),
    actualStartAt: stage.actualStartAt?.toISOString() ?? null,
    actualEndAt: stage.actualEndAt?.toISOString() ?? null,
    actualStartProvenance: stage.actualStartProvenance,
    actualEndProvenance: stage.actualEndProvenance,
    startedBy: stage.startedBy,
    completedBy: stage.completedBy,
    machineCount: Number(stage.machineCount),
  }));
  const detail: ProductionHistoryRunDetail = {
    overview: mapProductionHistoryRun(
      run,
      statistics.get(command.productionRunId) ?? emptyRunStatistics(),
    ),
    batches: batchRows.map((batch) => ({
      productionBatchId: batch.id,
      sequence: batch.sequence,
      status: mapBatchStatus(batch.status),
      derivedWeightLbs: batch.derivedWeightLbs,
      pulseCapacityLbs: batch.pulseCapacityLbs,
      currentOrderCount: Number(batch.currentOrderCount),
      historicalOrderCount: Number(batch.historicalOrderCount),
      startedAt: batch.startedAt?.toISOString() ?? null,
      finishedAt: batch.finishedAt?.toISOString() ?? null,
    })),
    orderMemberships: membershipRows.map((membership) =>
      mapOrderMembership(membership),
    ),
    stageProgress: {
      planned: stages.filter((stage) => stage.status === 'planned').length,
      started: stages.filter((stage) => stage.status === 'started').length,
      completed: stages.filter((stage) => stage.status === 'completed').length,
      items: stages,
    },
    scheduleLineage: {
      executionScheduleRunId: run.scheduleRunId,
      revisions: planRows.map((plan) =>
        mapProductionHistoryPlan(plan as ProductionHistoryPlanRow),
      ),
    },
    activity: {
      items: activityRows.slice(0, 100).flatMap((activity) => {
        const mapped = mapProductionHistoryActivity(
          activity,
          command.productionRunId,
        );
        return mapped === null ? [] : [mapped];
      }),
      hasMore: activityRows.length > 100,
    },
    asOf: now.toISOString(),
  };
  return { tag: 'found' as const, value: detail };
};

export const makeListProductionHistoryRepository = (
  database: Database,
): ProductionHistoryRepository => ({
  listRuns: (command, now) =>
    database.transaction((db) => listRuns(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
  listActivity: (command, now) =>
    database.transaction((db) => listActivity(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
  listPlans: (command, now) =>
    database.transaction((db) => listPlans(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
  loadRun: (command, now) =>
    database.transaction((db) => loadRun(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
