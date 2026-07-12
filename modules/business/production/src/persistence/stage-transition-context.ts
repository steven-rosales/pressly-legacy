import {
  and,
  asc,
  eq,
  laundryProduction,
  type DatabaseExecutor,
} from '@pressly/db';
import type {
  StageTransitionContext,
  StoredStage,
} from '../production.port.ts';
import { iso } from './production-mappers.ts';

export const loadStageTransitionContext = async (
  db: DatabaseExecutor,
  locationId: string,
  stageRunId: string,
): Promise<StageTransitionContext | null> => {
  const [stage] = await db
    .select()
    .from(laundryProduction.stageRuns)
    .where(
      and(
        eq(laundryProduction.stageRuns.locationId, locationId),
        eq(laundryProduction.stageRuns.id, stageRunId),
      ),
    )
    .limit(1);
  if (stage === undefined) return null;
  const [batch] = await db
    .select()
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, locationId),
        eq(laundryProduction.productionBatches.id, stage.productionBatchId),
      ),
    )
    .limit(1);
  if (batch === undefined) throw new Error('Batch not found.');
  const [run] = await db
    .select({ status: laundryProduction.productionRuns.status })
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.id, batch.productionRunId),
      ),
    )
    .limit(1);
  if (run === undefined) throw new Error('Production run not found.');
  const siblingStages = await db
    .select()
    .from(laundryProduction.stageRuns)
    .where(
      and(
        eq(laundryProduction.stageRuns.locationId, locationId),
        eq(laundryProduction.stageRuns.productionBatchId, batch.id),
      ),
    )
    .orderBy(asc(laundryProduction.stageRuns.plannedStartAt));
  const stageIndex = siblingStages.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  const previous = stageIndex <= 0 ? undefined : siblingStages[stageIndex - 1];
  const allStages = await db
    .select()
    .from(laundryProduction.stageRuns)
    .where(eq(laundryProduction.stageRuns.locationId, locationId));
  const assignments = await db
    .select()
    .from(laundryProduction.stageMachineAssignments)
    .where(
      eq(laundryProduction.stageMachineAssignments.locationId, locationId),
    );
  const selectedAssignments = assignments.filter(
    (assignment) => assignment.stageRunId === stage.id,
  );
  const overlappingMachineIds = new Set(
    assignments
      .filter(
        (assignment) =>
          assignment.stageRunId !== stage.id &&
          assignment.plannedStartAt < stage.plannedEndAt &&
          assignment.plannedEndAt > stage.plannedStartAt,
      )
      .map((assignment) => assignment.machineId),
  );
  const machineRows = await db
    .select()
    .from(laundryProduction.machines)
    .where(eq(laundryProduction.machines.locationId, locationId));
  const stationRows = await db
    .select()
    .from(laundryProduction.stations)
    .where(eq(laundryProduction.stations.locationId, locationId));
  const stationKindById = new Map(
    stationRows.map((station) => [station.id, station.kind]),
  );
  const storedStage: StoredStage = {
    id: stage.id,
    productionBatchId: stage.productionBatchId,
    stage: stage.stageKind as StoredStage['stage'],
    status: stage.status as StoredStage['status'],
    plannedStartAt: iso(stage.plannedStartAt),
    plannedEndAt: iso(stage.plannedEndAt),
    actualStartAt:
      stage.actualStartAt === null ? null : iso(stage.actualStartAt),
    machineIds: selectedAssignments.map((assignment) => assignment.machineId),
    version: stage.version,
  };

  return {
    stage: storedStage,
    productionRunStarted: run.status === 'started',
    previousStageCompleted:
      stageIndex === 0 || previous?.status === 'completed',
    sameKindAlreadyActive: allStages.some(
      (candidate) =>
        candidate.id !== stage.id &&
        candidate.stageKind === stage.stageKind &&
        candidate.status === 'started',
    ),
    batchWeightLbs: batch.derivedWeightLbs,
    machines: machineRows.flatMap((machine) => {
      const stationKind = stationKindById.get(machine.stationId);
      return machine.effectiveCapacityLbs === null
        ? []
        : [
            {
              id: machine.id,
              stationKind: stationKind ?? 'unknown',
              effectiveCapacityLbs: machine.effectiveCapacityLbs,
              active: machine.isActive,
              overlaps: overlappingMachineIds.has(machine.id),
            },
          ];
    }),
  };
};
