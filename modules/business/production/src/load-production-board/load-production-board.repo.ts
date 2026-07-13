import type {
  ProductionBatch,
  ProductionBoard,
  StageRun,
} from '@pressly/contracts';
import {
  and,
  asc,
  desc,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { LoadProductionBoardRepository } from './load-production-board.port.ts';
import { iso, mapOrder, mapShift } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { loadStageTransitionContext } from '../persistence/stage-transition-context.ts';

export const makeLoadProductionBoardRepository = (deps: {
  db: Database;
}): LoadProductionBoardRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    loadBoard: async (locationId, productionShiftId, now) => {
      const [shift] = await db
        .select()
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
          ),
        )
        .limit(1);
      if (shift === undefined) return null;
      const [run] = await db
        .select()
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(
              laundryProduction.productionRuns.productionShiftId,
              productionShiftId,
            ),
          ),
        )
        .orderBy(desc(laundryProduction.productionRuns.createdAt))
        .limit(1);
      const orderRows = await db
        .select()
        .from(laundryProduction.productionOrders)
        .where(eq(laundryProduction.productionOrders.locationId, locationId));
      const demandRows = await db
        .select()
        .from(laundryProduction.orderDemands)
        .where(eq(laundryProduction.orderDemands.locationId, locationId));
      const demandById = new Map(demandRows.map((row) => [row.id, row]));

      const batches: ProductionBatch[] = [];
      if (run !== undefined) {
        const batchRows = await db
          .select()
          .from(laundryProduction.productionBatches)
          .where(
            and(
              eq(laundryProduction.productionBatches.locationId, locationId),
              eq(laundryProduction.productionBatches.productionRunId, run.id),
            ),
          )
          .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));
        const joinRows = await db
          .select()
          .from(laundryProduction.productionBatchOrders)
          .where(
            eq(laundryProduction.productionBatchOrders.locationId, locationId),
          );
        const stageRows = await db
          .select()
          .from(laundryProduction.stageRuns)
          .where(eq(laundryProduction.stageRuns.locationId, locationId))
          .orderBy(asc(laundryProduction.stageRuns.plannedStartAt));
        const assignmentRows = await db
          .select()
          .from(laundryProduction.stageMachineAssignments)
          .where(
            eq(
              laundryProduction.stageMachineAssignments.locationId,
              locationId,
            ),
          );

        for (const batch of batchRows) {
          const orderIds = joinRows
            .filter((join) => join.productionBatchId === batch.id)
            .map((join) => join.productionOrderId);
          const stages = stageRows.filter(
            (stage) => stage.productionBatchId === batch.id,
          );
          batches.push({
            id: batch.id,
            sequence: batch.sequenceIndex,
            status: batch.status as ProductionBatch['status'],
            derivedWeightLbs: batch.derivedWeightLbs,
            pulseCapacityLbs: batch.pulseCapacityLbs,
            pulseMinutes: batch.pulseMinutes,
            orders: orderIds.map((orderId) => {
              const order = orderRows.find(
                (candidate) => candidate.id === orderId,
              );
              if (order === undefined) throw new Error('Order not found.');
              const demand = demandById.get(order.orderDemandId);
              if (demand === undefined)
                throw new Error('Order demand not found.');
              return mapOrder(order, demand.displayReference, now);
            }),
            stages: stages.map(
              (stage): StageRun => ({
                id: stage.id,
                productionBatchId: stage.productionBatchId,
                stage: stage.stageKind as StageRun['stage'],
                status: stage.status as StageRun['status'],
                plannedStartAt: iso(stage.plannedStartAt),
                plannedEndAt: iso(stage.plannedEndAt),
                actualStartAt:
                  stage.actualStartAt === null
                    ? null
                    : iso(stage.actualStartAt),
                actualEndAt:
                  stage.actualEndAt === null ? null : iso(stage.actualEndAt),
                machineIds: assignmentRows
                  .filter((assignment) => assignment.stageRunId === stage.id)
                  .map((assignment) => assignment.machineId),
                allowedActions: [],
                version: stage.version,
              }),
            ),
            version: batch.version,
          });
        }
      }

      return {
        productionShift: mapShift(shift),
        productionRun:
          run === undefined
            ? null
            : {
                id: run.id,
                status: run.status as 'planned' | 'started' | 'completed',
                allowedActions: run.status === 'planned' ? ['start'] : [],
                version: run.version,
              },
        batches,
        eligibleOrders: orderRows
          .filter(
            (order) => order.status === 'eligible' && order.bagCount !== null,
          )
          .map((order) => {
            const demand = demandById.get(order.orderDemandId);
            if (demand === undefined)
              throw new Error('Order demand not found.');
            return mapOrder(order, demand.displayReference, now);
          }),
        asOf: iso(now),
      } satisfies ProductionBoard;
    },
    loadStageTransitionContext: (locationId, stageRunId) =>
      loadStageTransitionContext(db, locationId, stageRunId),
  }));
