import type { ProductionActorReadV1Capability } from '@pressly/access-system/capabilities/production-actor-read-v1';
import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, desc, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import {
  emptyHistoryRunStatistics,
  historyEventTypes,
  projectHistoryActivity,
  projectHistoryBatch,
  projectHistoryMembership,
  projectHistoryPlan,
  projectHistoryRun,
  projectHistoryStage,
} from './project.ts';
import type {
  HistoryRunStatistics,
  LoadHistoryRunInput,
  LoadHistoryRunRepository,
} from './types.ts';

const runSelect = (schema: ProductionSchema) =>
  ({
    id: schema.productionRuns.id,
    productionShiftId: schema.productionRuns.productionShiftId,
    scheduleRunId: schema.productionRuns.scheduleRunId,
    status: schema.productionRuns.status,
    shiftStartsAt: schema.productionShifts.startsAt,
    shiftEndsAt: schema.productionShifts.endsAt,
    timezone: schema.productionShifts.timezone,
    startedAt: schema.productionRuns.startedAt,
    completedAt: schema.productionRuns.completedAt,
    plannedCompletionAt: schema.productionRuns.plannedCompletionAt,
    queueVersion: schema.productionRuns.queueVersion,
    overtimeAcknowledgedAt: schema.productionRuns.overtimeAcknowledgedAt,
    createdAt: schema.productionRuns.createdAt,
  }) as const;

const planSelect = (schema: ProductionSchema) =>
  ({
    id: schema.scheduleRuns.id,
    productionShiftId: schema.scheduleRuns.productionShiftId,
    linkedProductionRunId: schema.productionRuns.id,
    status: schema.scheduleRuns.status,
    shiftStartsAt: schema.productionShifts.startsAt,
    shiftEndsAt: schema.productionShifts.endsAt,
    algorithmVersion: schema.scheduleRuns.algorithmVersion,
    schedulerConfigId: schema.scheduleRuns.schedulerConfigId,
    inputSnapshotHash: schema.scheduleRuns.inputSnapshotHash,
    outputPlanHash: schema.scheduleRuns.outputPlanHash,
    pulseCapacityLbs: schema.scheduleRuns.pulseCapacityLbs,
    batchCount: schema.scheduleRuns.batchCount,
    makespanMinutes: schema.scheduleRuns.makespanMinutes,
    plannedCompletionAt: schema.scheduleRuns.plannedCompletionAt,
    warnings: schema.scheduleRuns.warnings,
    acknowledgedWarningCodes: schema.scheduleRuns.acknowledgedWarningCodes,
    createdAt: schema.scheduleRuns.createdAt,
    acceptedAt: schema.scheduleRuns.acceptedAt,
    acceptedBy: schema.scheduleRuns.acceptedBy,
    supersededAt: schema.scheduleRuns.supersededAt,
  }) as const;

const activitySelect = (schema: ProductionSchema) =>
  ({
    id: schema.workEvents.id,
    eventType: schema.workEvents.eventType,
    entityType: schema.workEvents.entityType,
    entityId: schema.workEvents.entityId,
    actorId: schema.workEvents.actorId,
    expectedVersion: schema.workEvents.expectedVersion,
    payload: schema.workEvents.payload,
    currentResolutionState: schema.productionOrders.resolutionState,
    currentProductionVersion: schema.productionOrders.version,
    createdAt: schema.workEvents.createdAt,
  }) as const;

const locationExists = async (
  locationId: string,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<boolean> =>
  (await productionScopeReconciliationV1.load({
    locationId,
  })) !== null;

const runScope = (productionRunId: string, schema: ProductionSchema) =>
  sql<boolean>`(
    (${schema.workEvents.entityType} = 'production_run'
      and ${schema.workEvents.entityId} = ${productionRunId})
    or (${schema.workEvents.entityType} = 'production_batch'
      and exists (
        select 1 from production_batches as scoped_batch
        where scoped_batch.id = ${schema.workEvents.entityId}
          and scoped_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'stage_run'
      and exists (
        select 1 from stage_runs as scoped_stage
        join production_batches as scoped_stage_batch
          on scoped_stage_batch.id = scoped_stage.production_batch_id
        where scoped_stage.id = ${schema.workEvents.entityId}
          and scoped_stage_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'schedule_run'
      and exists (
        select 1 from production_runs as scoped_schedule_run
        where scoped_schedule_run.schedule_run_id = ${schema.workEvents.entityId}
          and scoped_schedule_run.id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'production_shift'
      and exists (
        select 1 from production_runs as scoped_shift_run
        where scoped_shift_run.production_shift_id = ${schema.workEvents.entityId}
          and scoped_shift_run.id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'production_order'
      and exists (
        select 1 from production_batch_orders as scoped_membership
        join production_batches as scoped_order_batch
          on scoped_order_batch.id = scoped_membership.production_batch_id
        where scoped_membership.production_order_id = ${schema.workEvents.entityId}
          and scoped_order_batch.production_run_id = ${productionRunId}
      ))
    or (${schema.workEvents.entityType} = 'order_demand'
      and exists (
        select 1 from production_orders as scoped_order
        join production_batch_orders as scoped_demand_membership
          on scoped_demand_membership.production_order_id = scoped_order.id
        join production_batches as scoped_demand_batch
          on scoped_demand_batch.id = scoped_demand_membership.production_batch_id
        where scoped_order.order_demand_id = ${schema.workEvents.entityId}
          and scoped_demand_batch.production_run_id = ${productionRunId}
      ))
  )`;

const loadStatistics = async (
  database: PostgresExecutor,
  runIds: readonly string[],
  schema: ProductionSchema,
): Promise<ReadonlyMap<string, HistoryRunStatistics>> => {
  if (runIds.length === 0) return new Map();
  const [batchRows, orderRows] = await Promise.all([
    database
      .select({
        productionRunId: schema.productionBatches.productionRunId,
        batchCount: sql<number>`count(*)`,
        completedBatchCount: sql<number>`count(*) filter (where ${schema.productionBatches.status} = 'finished')`,
        totalWeightLbs: sql<number>`coalesce(sum(${schema.productionBatches.derivedWeightLbs}), 0)`,
      })
      .from(schema.productionBatches)
      .where(inArray(schema.productionBatches.productionRunId, [...runIds]))
      .groupBy(schema.productionBatches.productionRunId),
    database
      .select({
        productionRunId: schema.productionBatches.productionRunId,
        orderCount: sql<number>`count(distinct ${schema.productionBatchOrders.productionOrderId})`,
        priorityOrderCount: sql<number>`count(distinct ${schema.productionBatchOrders.productionOrderId}) filter (where ${schema.productionOrders.priority} = true)`,
      })
      .from(schema.productionBatchOrders)
      .innerJoin(
        schema.productionBatches,
        and(
          eq(
            schema.productionBatches.id,
            schema.productionBatchOrders.productionBatchId,
          ),
          eq(
            schema.productionBatches.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        schema.productionOrders,
        and(
          eq(
            schema.productionOrders.id,
            schema.productionBatchOrders.productionOrderId,
          ),
          eq(
            schema.productionOrders.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .where(inArray(schema.productionBatches.productionRunId, [...runIds]))
      .groupBy(schema.productionBatches.productionRunId),
  ]);
  const statistics = new Map<string, HistoryRunStatistics>();
  for (const row of batchRows)
    statistics.set(row.productionRunId, {
      ...emptyHistoryRunStatistics(),
      batchCount: Number(row.batchCount),
      completedBatchCount: Number(row.completedBatchCount),
      totalWeightLbs: Number(row.totalWeightLbs),
    });
  for (const row of orderRows) {
    const current =
      statistics.get(row.productionRunId) ?? emptyHistoryRunStatistics();
    statistics.set(row.productionRunId, {
      ...current,
      orderCount: Number(row.orderCount),
      priorityOrderCount: Number(row.priorityOrderCount),
    });
  }
  return statistics;
};

const readHistoryRun = async (
  database: PostgresExecutor,
  input: LoadHistoryRunInput,
  asOf: Date,
  schema: ProductionSchema,
) => {
  const [run] = await database
    .select(runSelect(schema))
    .from(schema.productionRuns)
    .innerJoin(
      schema.productionShifts,
      and(
        eq(schema.productionShifts.id, schema.productionRuns.productionShiftId),
        eq(
          schema.productionShifts.locationId,
          schema.productionRuns.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.id, input.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) return { kind: 'run_not_found' as const };

  const [
    batchRows,
    membershipRows,
    stageRows,
    planRows,
    activityRows,
    statistics,
  ] = await Promise.all([
    database
      .select({
        id: schema.productionBatches.id,
        sequence: schema.productionBatches.sequenceIndex,
        status: schema.productionBatches.status,
        derivedWeightLbs: schema.productionBatches.derivedWeightLbs,
        pulseCapacityLbs: schema.productionBatches.pulseCapacityLbs,
        startedAt: schema.productionBatches.startedAt,
        finishedAt: schema.productionBatches.finishedAt,
        currentOrderCount: sql<number>`count(${schema.productionBatchOrders.productionOrderId}) filter (where ${schema.productionBatchOrders.active} = true)`,
        historicalOrderCount: sql<number>`count(${schema.productionBatchOrders.productionOrderId})`,
      })
      .from(schema.productionBatches)
      .leftJoin(
        schema.productionBatchOrders,
        and(
          eq(
            schema.productionBatchOrders.productionBatchId,
            schema.productionBatches.id,
          ),
          eq(
            schema.productionBatchOrders.locationId,
            schema.productionBatches.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.productionBatches.locationId, input.locationId),
          eq(schema.productionBatches.productionRunId, input.productionRunId),
        ),
      )
      .groupBy(schema.productionBatches.id)
      .orderBy(schema.productionBatches.sequenceIndex),
    database
      .select({
        membershipId: schema.productionBatchOrders.id,
        productionOrderId: schema.productionBatchOrders.productionOrderId,
        externalOrderId: schema.orderDemands.displayReference,
        orderStatus: schema.productionOrders.operationalStatus,
        derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
        bagCount: schema.productionOrders.bagCount,
        productionBatchId: schema.productionBatchOrders.productionBatchId,
        batchSequence: schema.productionBatches.sequenceIndex,
        placementProvenance: schema.productionBatchOrders.placementProvenance,
        active: schema.productionBatchOrders.active,
        placedAt: schema.productionBatchOrders.placedAt,
        placedBy: schema.productionBatchOrders.placedBy,
        releasedAt: schema.productionBatchOrders.releasedAt,
        releasedBy: schema.productionBatchOrders.releasedBy,
        releaseReason: schema.productionBatchOrders.releaseReason,
      })
      .from(schema.productionBatchOrders)
      .innerJoin(
        schema.productionBatches,
        and(
          eq(
            schema.productionBatches.id,
            schema.productionBatchOrders.productionBatchId,
          ),
          eq(
            schema.productionBatches.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        schema.productionOrders,
        and(
          eq(
            schema.productionOrders.id,
            schema.productionBatchOrders.productionOrderId,
          ),
          eq(
            schema.productionOrders.locationId,
            schema.productionBatchOrders.locationId,
          ),
        ),
      )
      .innerJoin(
        schema.orderDemands,
        and(
          eq(schema.orderDemands.id, schema.productionOrders.orderDemandId),
          eq(
            schema.orderDemands.locationId,
            schema.productionOrders.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.productionBatchOrders.locationId, input.locationId),
          eq(schema.productionBatches.productionRunId, input.productionRunId),
        ),
      )
      .orderBy(
        schema.productionBatches.sequenceIndex,
        schema.productionBatchOrders.placedAt,
        schema.productionBatchOrders.id,
      ),
    database
      .select({
        stageRunId: schema.stageRuns.id,
        productionBatchId: schema.stageRuns.productionBatchId,
        batchSequence: schema.productionBatches.sequenceIndex,
        stage: schema.stageRuns.stageKind,
        status: schema.stageRuns.status,
        plannedStartAt: schema.stageRuns.plannedStartAt,
        plannedEndAt: schema.stageRuns.plannedEndAt,
        actualStartAt: schema.stageRuns.actualStartAt,
        actualEndAt: schema.stageRuns.actualEndAt,
        actualStartProvenance: schema.stageRuns.actualStartProvenance,
        actualEndProvenance: schema.stageRuns.actualEndProvenance,
        startedBy: schema.stageRuns.startedBy,
        completedBy: schema.stageRuns.completedBy,
        machineCount: sql<number>`count(${schema.stageMachineAssignments.id})`,
      })
      .from(schema.stageRuns)
      .innerJoin(
        schema.productionBatches,
        and(
          eq(schema.productionBatches.id, schema.stageRuns.productionBatchId),
          eq(schema.productionBatches.locationId, schema.stageRuns.locationId),
        ),
      )
      .leftJoin(
        schema.stageMachineAssignments,
        and(
          eq(schema.stageMachineAssignments.stageRunId, schema.stageRuns.id),
          eq(
            schema.stageMachineAssignments.locationId,
            schema.stageRuns.locationId,
          ),
        ),
      )
      .where(
        and(
          eq(schema.stageRuns.locationId, input.locationId),
          eq(schema.productionBatches.productionRunId, input.productionRunId),
        ),
      )
      .groupBy(schema.stageRuns.id, schema.productionBatches.sequenceIndex)
      .orderBy(
        schema.productionBatches.sequenceIndex,
        schema.stageRuns.plannedStartAt,
      ),
    database
      .select(planSelect(schema))
      .from(schema.scheduleRuns)
      .innerJoin(
        schema.productionShifts,
        and(
          eq(schema.productionShifts.id, schema.scheduleRuns.productionShiftId),
          eq(
            schema.productionShifts.locationId,
            schema.scheduleRuns.locationId,
          ),
        ),
      )
      .leftJoin(
        schema.productionRuns,
        and(
          eq(schema.productionRuns.scheduleRunId, schema.scheduleRuns.id),
          eq(schema.productionRuns.locationId, schema.scheduleRuns.locationId),
        ),
      )
      .where(
        and(
          eq(schema.scheduleRuns.locationId, input.locationId),
          eq(schema.scheduleRuns.productionShiftId, run.productionShiftId),
        ),
      )
      .orderBy(
        desc(schema.scheduleRuns.createdAt),
        desc(schema.scheduleRuns.id),
      ),
    database
      .select(activitySelect(schema))
      .from(schema.workEvents)
      .leftJoin(
        schema.productionOrders,
        and(
          eq(schema.productionOrders.id, schema.workEvents.entityId),
          eq(schema.productionOrders.locationId, schema.workEvents.locationId),
          eq(schema.workEvents.entityType, 'production_order'),
        ),
      )
      .where(
        and(
          eq(schema.workEvents.locationId, input.locationId),
          inArray(schema.workEvents.eventType, [...historyEventTypes]),
          runScope(input.productionRunId, schema),
        ),
      )
      .orderBy(desc(schema.workEvents.createdAt), desc(schema.workEvents.id))
      .limit(101),
    loadStatistics(database, [input.productionRunId], schema),
  ]);

  const stages = stageRows.map(projectHistoryStage);
  return {
    kind: 'found' as const,
    detail: {
      overview: projectHistoryRun(
        run,
        statistics.get(input.productionRunId) ?? emptyHistoryRunStatistics(),
      ),
      batches: batchRows.map(projectHistoryBatch),
      orderMemberships: membershipRows.map(projectHistoryMembership),
      stageProgress: {
        planned: stages.filter((stage) => stage.status === 'planned').length,
        started: stages.filter((stage) => stage.status === 'started').length,
        completed: stages.filter((stage) => stage.status === 'completed')
          .length,
        items: stages,
      },
      scheduleLineage: {
        executionScheduleRunId: run.scheduleRunId,
        revisions: planRows.map(projectHistoryPlan),
      },
      activity: {
        items: activityRows.slice(0, 100).flatMap((activity) => {
          const projected = projectHistoryActivity(
            {
              ...activity,
              actorDisplayName: null,
            },
            input.productionRunId,
          );
          return projected === null ? [] : [projected];
        }),
        hasMore: activityRows.length > 100,
      },
      asOf,
    },
  };
};

export const makeLoadHistoryRunPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionActorReadV1: ProductionActorReadV1Capability,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): LoadHistoryRunRepository => ({
  load: async (input, asOf) => {
    const exists = await locationExists(
      input.locationId,
      productionScopeReconciliationV1,
    );
    const readOptions = {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    } as const;
    const outcome = exists
      ? await database.transaction(
          (transaction) => readHistoryRun(transaction, input, asOf, schema),
          readOptions,
        )
      : await database.transaction(
          async () => ({ kind: 'location_not_found' as const }),
          readOptions,
        );
    if (outcome.kind !== 'found') return outcome;

    const actors = await productionActorReadV1.loadActors({
      actorIds: outcome.detail.activity.items.map((item) => item.actor.id),
    });
    const actorDisplayNameById = new Map(
      actors.map((actor) => [actor.id, actor.displayName]),
    );
    return {
      ...outcome,
      detail: {
        ...outcome.detail,
        activity: {
          ...outcome.detail.activity,
          items: outcome.detail.activity.items.map((item) => {
            if (item.actor.kind === 'system') return item;
            const displayName = actorDisplayNameById.get(item.actor.id) ?? null;
            return {
              ...item,
              actor:
                displayName === null || displayName.trim().length === 0
                  ? {
                      id: item.actor.id,
                      kind: 'unknown' as const,
                      displayName: null,
                    }
                  : {
                      id: item.actor.id,
                      kind: 'user' as const,
                      displayName: displayName.trim(),
                    },
            };
          }),
        },
      },
    };
  },
});
