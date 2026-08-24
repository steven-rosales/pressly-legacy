import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../schema/production-schema.ts';
import { projectBoardSnapshot } from './project.ts';

export const loadProductionBoardSnapshot = async (
  database: PostgresExecutor,
  locationId: string,
  productionRunId: string,
  asOf: Date,
  schema: ProductionSchema,
) => {
  const [run] = await database
    .select()
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, locationId),
        eq(schema.productionRuns.id, productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) return null;

  const [shiftRows, activeRunRows, orderRows, batchRows, activeStageRows] =
    await Promise.all([
      database
        .select()
        .from(schema.productionShifts)
        .where(
          and(
            eq(schema.productionShifts.locationId, locationId),
            eq(schema.productionShifts.id, run.productionShiftId),
          ),
        )
        .limit(1),
      database
        .select({ id: schema.productionRuns.id })
        .from(schema.productionRuns)
        .where(
          and(
            eq(schema.productionRuns.locationId, locationId),
            eq(schema.productionRuns.status, 'started'),
          ),
        ),
      database
        .select({
          id: schema.productionOrders.id,
          locationId: schema.productionOrders.locationId,
          orderDemandId: schema.productionOrders.orderDemandId,
          externalOrderId: schema.orderDemands.displayReference,
          dueAt: schema.productionOrders.dueAt,
          priority: schema.productionOrders.priority,
          status: schema.productionOrders.operationalStatus,
          derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
          bagCount: schema.productionOrders.bagCount,
          bagCountSource: schema.productionOrders.bagCountSource,
          intakeVersion: schema.productionOrders.intakeVersion,
          pendingPlacement: schema.productionOrders.pendingPlacement,
          version: schema.productionOrders.version,
        })
        .from(schema.productionOrders)
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
            eq(schema.productionOrders.locationId, locationId),
            eq(schema.productionOrders.resolutionState, 'open'),
          ),
        )
        .orderBy(asc(schema.productionOrders.id)),
      database
        .select()
        .from(schema.productionBatches)
        .where(
          and(
            eq(schema.productionBatches.locationId, locationId),
            eq(schema.productionBatches.productionRunId, productionRunId),
          ),
        )
        .orderBy(asc(schema.productionBatches.sequenceIndex)),
      database
        .select({
          id: schema.stageRuns.id,
          stageKind: schema.stageRuns.stageKind,
        })
        .from(schema.stageRuns)
        .where(
          and(
            eq(schema.stageRuns.locationId, locationId),
            eq(schema.stageRuns.status, 'started'),
          ),
        ),
    ]);
  const shift = shiftRows[0];
  if (shift === undefined) return null;

  const batchIds = batchRows.map((batch) => batch.id);
  const [batchOrderRows, stageRows] = await Promise.all([
    batchIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            productionBatchId: schema.productionBatchOrders.productionBatchId,
            productionOrderId: schema.productionBatchOrders.productionOrderId,
            active: schema.productionBatchOrders.active,
            placementProvenance:
              schema.productionBatchOrders.placementProvenance,
            pinnedAt: schema.productionBatchOrders.pinnedAt,
            pinnedBy: schema.productionBatchOrders.pinnedBy,
          })
          .from(schema.productionBatchOrders)
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
          .where(
            and(
              eq(schema.productionBatchOrders.locationId, locationId),
              inArray(schema.productionBatchOrders.productionBatchId, batchIds),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          ),
    batchIds.length === 0
      ? Promise.resolve([])
      : database
          .select()
          .from(schema.stageRuns)
          .where(
            and(
              eq(schema.stageRuns.locationId, locationId),
              inArray(schema.stageRuns.productionBatchId, batchIds),
            ),
          )
          .orderBy(
            asc(schema.stageRuns.productionBatchId),
            asc(schema.stageRuns.plannedStartAt),
          ),
  ]);
  const relevantStageIds = [
    ...new Set([
      ...stageRows.map((stage) => stage.id),
      ...activeStageRows.map((stage) => stage.id),
    ]),
  ];
  // Assignment scope is deliberately bounded to the selected board stages
  // plus active location stages that can conflict with them.
  const assignmentRows =
    relevantStageIds.length === 0
      ? []
      : await database
          .select({
            stageRunId: schema.stageMachineAssignments.stageRunId,
            machineId: schema.stageMachineAssignments.machineId,
            plannedStartAt: schema.stageMachineAssignments.plannedStartAt,
            plannedEndAt: schema.stageMachineAssignments.plannedEndAt,
          })
          .from(schema.stageMachineAssignments)
          .where(
            and(
              eq(schema.stageMachineAssignments.locationId, locationId),
              inArray(
                schema.stageMachineAssignments.stageRunId,
                relevantStageIds,
              ),
            ),
          );

  return projectBoardSnapshot({
    shift,
    run,
    orders: orderRows,
    batches: batchRows,
    batchOrders: batchOrderRows,
    stages: stageRows,
    assignments: assignmentRows,
    activeStages: activeStageRows,
    activeProductionRunIds: activeRunRows.map((candidate) => candidate.id),
    now: asOf,
  });
};
