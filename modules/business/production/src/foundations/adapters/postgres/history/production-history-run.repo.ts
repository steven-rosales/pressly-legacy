import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, inArray, sql } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { emptyProductionHistoryRunStatistics } from './production-history-run.persistence.mapper.ts';
import type { ProductionHistoryRunStatistics } from './production-history-row.adapter.ts';

export const productionHistoryRunSelect = {
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
} as const;

export const loadProductionHistoryRunStatistics = async (
  db: DatabaseExecutor,
  runIds: readonly string[],
): Promise<ReadonlyMap<string, ProductionHistoryRunStatistics>> => {
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
      ...emptyProductionHistoryRunStatistics(),
      batchCount: Number(row.batchCount),
      completedBatchCount: Number(row.completedBatchCount),
      totalWeightLbs: Number(row.totalWeightLbs),
    });

  for (const row of orderRows) {
    const current =
      statistics.get(row.productionRunId) ??
      emptyProductionHistoryRunStatistics();
    statistics.set(row.productionRunId, {
      ...current,
      orderCount: Number(row.orderCount),
      priorityOrderCount: Number(row.priorityOrderCount),
    });
  }

  return statistics;
};
