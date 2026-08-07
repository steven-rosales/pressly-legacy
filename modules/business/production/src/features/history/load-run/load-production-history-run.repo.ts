import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, desc, eq, inArray, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { mapProductionHistoryActivity } from '../../../foundations/adapters/postgres/history/production-history-activity.persistence.mapper.ts';
import {
  productionHistoryActivitySelect,
  productionHistoryRunScope,
} from '../../../foundations/adapters/postgres/history/production-history-activity.repo.ts';
import { productionHistoryLocationExists } from '../../../foundations/adapters/postgres/history/production-history-location.repo.ts';
import {
  productionHistoryEventTypes,
  type ProductionHistoryRunDetail,
} from '../../../foundations/language/history/production-history.model.ts';
import { mapProductionHistoryPlan } from '../../../foundations/adapters/postgres/history/production-history-plan.persistence.mapper.ts';
import { productionHistoryPlanSelect } from '../../../foundations/adapters/postgres/history/production-history-plan.repo.ts';
import {
  emptyProductionHistoryRunStatistics,
  mapProductionHistoryBatch,
  mapProductionHistoryOrderMembership,
  mapProductionHistoryRun,
  mapProductionHistoryStage,
} from '../../../foundations/adapters/postgres/history/production-history-run.persistence.mapper.ts';
import {
  loadProductionHistoryRunStatistics,
  productionHistoryRunSelect,
} from '../../../foundations/adapters/postgres/history/production-history-run.repo.ts';
import type { LoadProductionHistoryRunCommand } from './load-production-history-run.model.ts';
import type { LoadProductionHistoryRunRepository } from './load-production-history-run.port.ts';

const loadRun = async (
  db: DatabaseExecutor,
  command: LoadProductionHistoryRunCommand,
  now: Date,
) => {
  if (!(await productionHistoryLocationExists(db, command.locationId)))
    return { tag: 'location_not_found' as const };

  const [run] = await db
    .select(productionHistoryRunSelect)
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
        orderStatus: laundryProduction.productionOrders.operationalStatus,
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
      .select(productionHistoryPlanSelect)
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
      .select(productionHistoryActivitySelect)
      .from(laundryProduction.workEvents)
      .leftJoin(
        auth.authIdentities,
        eq(auth.authIdentities.id, laundryProduction.workEvents.actorId),
      )
      .leftJoin(
        laundryProduction.productionOrders,
        and(
          eq(
            laundryProduction.productionOrders.id,
            laundryProduction.workEvents.entityId,
          ),
          eq(
            laundryProduction.productionOrders.locationId,
            laundryProduction.workEvents.locationId,
          ),
          eq(laundryProduction.workEvents.entityType, 'production_order'),
        ),
      )
      .where(
        and(
          eq(laundryProduction.workEvents.locationId, command.locationId),
          inArray(laundryProduction.workEvents.eventType, [
            ...productionHistoryEventTypes,
          ]),
          productionHistoryRunScope(command.productionRunId),
        ),
      )
      .orderBy(
        desc(laundryProduction.workEvents.createdAt),
        desc(laundryProduction.workEvents.id),
      )
      .limit(101),
    loadProductionHistoryRunStatistics(db, [command.productionRunId]),
  ]);

  const stages = stageRows.map(mapProductionHistoryStage);
  const detail: ProductionHistoryRunDetail = {
    overview: mapProductionHistoryRun(
      run,
      statistics.get(command.productionRunId) ??
        emptyProductionHistoryRunStatistics(),
    ),
    batches: batchRows.map(mapProductionHistoryBatch),
    orderMemberships: membershipRows.map(mapProductionHistoryOrderMembership),
    stageProgress: {
      planned: stages.filter((stage) => stage.status === 'planned').length,
      started: stages.filter((stage) => stage.status === 'started').length,
      completed: stages.filter((stage) => stage.status === 'completed').length,
      items: stages,
    },
    scheduleLineage: {
      executionScheduleRunId: run.scheduleRunId,
      revisions: planRows.map(mapProductionHistoryPlan),
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
    asOf: now,
  };

  return { tag: 'found' as const, value: detail };
};

export const makeLoadProductionHistoryRunRepository = (
  database: Database,
): LoadProductionHistoryRunRepository => ({
  load: (command, now) =>
    database.transaction((db) => loadRun(db, command, now), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
