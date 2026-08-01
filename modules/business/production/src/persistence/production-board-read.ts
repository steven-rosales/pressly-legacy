import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  type DatabaseExecutor,
} from '@pressly/db';
import { projectProductionBoard } from './production-board-projection.ts';
import type { ProductionBoardProjection } from '../production-policy/production-board-read.policy.ts';

export const loadProductionBoardProjection = async (
  db: DatabaseExecutor,
  locationId: string,
  productionRunId: string,
  now: Date,
): Promise<ProductionBoardProjection | null> => {
  const [run] = await db
    .select()
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.id, productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) return null;

  const [shiftRows, activeRunRows, orderRows, batchRows, activeStageRows] =
    await Promise.all([
      db
        .select()
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, run.productionShiftId),
          ),
        )
        .limit(1),
      db
        .select({ id: laundryProduction.productionRuns.id })
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.status, 'started'),
          ),
        ),
      db
        .select({
          id: laundryProduction.productionOrders.id,
          locationId: laundryProduction.productionOrders.locationId,
          orderDemandId: laundryProduction.productionOrders.orderDemandId,
          externalOrderId: laundryProduction.orderDemands.displayReference,
          dueAt: laundryProduction.productionOrders.dueAt,
          priority: laundryProduction.productionOrders.priority,
          status: laundryProduction.productionOrders.operationalStatus,
          derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
          bagCount: laundryProduction.productionOrders.bagCount,
          bagCountSource: laundryProduction.productionOrders.bagCountSource,
          intakeVersion: laundryProduction.productionOrders.intakeVersion,
          pendingPlacement: laundryProduction.productionOrders.pendingPlacement,
          version: laundryProduction.productionOrders.version,
        })
        .from(laundryProduction.productionOrders)
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
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id)),
      db
        .select()
        .from(laundryProduction.productionBatches)
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(
              laundryProduction.productionBatches.productionRunId,
              productionRunId,
            ),
          ),
        )
        .orderBy(asc(laundryProduction.productionBatches.sequenceIndex)),
      db
        .select({
          id: laundryProduction.stageRuns.id,
          stageKind: laundryProduction.stageRuns.stageKind,
        })
        .from(laundryProduction.stageRuns)
        .where(
          and(
            eq(laundryProduction.stageRuns.locationId, locationId),
            eq(laundryProduction.stageRuns.status, 'started'),
          ),
        ),
    ]);
  const shift = shiftRows[0];
  if (shift === undefined) return null;

  const batchIds = batchRows.map((batch) => batch.id);
  const [batchOrderRows, stageRows] = await Promise.all([
    batchIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            productionBatchId:
              laundryProduction.productionBatchOrders.productionBatchId,
            productionOrderId:
              laundryProduction.productionBatchOrders.productionOrderId,
            active: laundryProduction.productionBatchOrders.active,
            placementProvenance:
              laundryProduction.productionBatchOrders.placementProvenance,
            pinnedAt: laundryProduction.productionBatchOrders.pinnedAt,
            pinnedBy: laundryProduction.productionBatchOrders.pinnedBy,
          })
          .from(laundryProduction.productionBatchOrders)
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
            and(
              eq(
                laundryProduction.productionBatchOrders.locationId,
                locationId,
              ),
              inArray(
                laundryProduction.productionBatchOrders.productionBatchId,
                batchIds,
              ),
              eq(laundryProduction.productionOrders.resolutionState, 'open'),
            ),
          ),
    batchIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(laundryProduction.stageRuns)
          .where(
            and(
              eq(laundryProduction.stageRuns.locationId, locationId),
              inArray(laundryProduction.stageRuns.productionBatchId, batchIds),
            ),
          )
          .orderBy(
            asc(laundryProduction.stageRuns.productionBatchId),
            asc(laundryProduction.stageRuns.plannedStartAt),
          ),
  ]);
  const relevantStageIds = [
    ...new Set([
      ...stageRows.map((stage) => stage.id),
      ...activeStageRows.map((stage) => stage.id),
    ]),
  ];
  // The selected stage assignments and currently active conflicts are read in
  // one bounded set. This is intentionally advisory: the versioned command
  // path rechecks under the run -> batch -> stage lock order before mutation.
  const assignmentRows =
    relevantStageIds.length === 0
      ? []
      : await db
          .select({
            stageRunId: laundryProduction.stageMachineAssignments.stageRunId,
            machineId: laundryProduction.stageMachineAssignments.machineId,
            plannedStartAt:
              laundryProduction.stageMachineAssignments.plannedStartAt,
            plannedEndAt:
              laundryProduction.stageMachineAssignments.plannedEndAt,
          })
          .from(laundryProduction.stageMachineAssignments)
          .where(
            and(
              eq(
                laundryProduction.stageMachineAssignments.locationId,
                locationId,
              ),
              inArray(
                laundryProduction.stageMachineAssignments.stageRunId,
                relevantStageIds,
              ),
            ),
          );

  return projectProductionBoard({
    shift,
    run,
    orders: orderRows,
    batches: batchRows,
    batchOrders: batchOrderRows,
    stages: stageRows,
    assignments: assignmentRows,
    activeStages: activeStageRows,
    activeProductionRunIds: activeRunRows.map((candidate) => candidate.id),
    now,
  });
};
