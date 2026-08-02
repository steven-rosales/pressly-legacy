import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  type DatabaseExecutor,
} from '@pressly/db';
import { invariantViolationError } from '@pressly/errors';
import type {
  StageTransitionContext,
  StoredStage,
} from '../production-lifecycle/stage-transition.model.ts';
import { iso } from './production-mappers.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const batchStatus = (
  value: string,
): StageTransitionContext['batch']['status'] => {
  if (
    value === 'queued' ||
    value === 'sorting' ||
    value === 'washing' ||
    value === 'drying' ||
    value === 'folding_packaging' ||
    value === 'finished'
  )
    return value;
  throw productionInvariantViolation(
    'production_stage_context_batch_status_invalid',
    `Unknown production batch status: ${value}.`,
  );
};

const attemptStatus = (
  value: string,
): StageTransitionContext['attempts'][number]['status'] => {
  if (value === 'assigned' || value === 'completed' || value === 'released')
    return value;
  throw productionInvariantViolation(
    'production_stage_context_attempt_status_invalid',
    `Unknown order-stage attempt status: ${value}.`,
  );
};

export const loadStageTransitionContext = async (
  db: DatabaseExecutor,
  locationId: string,
  stageRunId: string,
): Promise<StageTransitionContext | null> => {
  const [identity] = await db
    .select({
      stageRunId: laundryProduction.stageRuns.id,
      productionBatchId: laundryProduction.productionBatches.id,
      productionRunId: laundryProduction.productionBatches.productionRunId,
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
    .where(
      and(
        eq(laundryProduction.stageRuns.locationId, locationId),
        eq(laundryProduction.stageRuns.id, stageRunId),
      ),
    )
    .limit(1);
  if (identity === undefined) return null;

  // Queue composition, membership, and stage transitions share this order.
  // The preliminary identity read acquires no locks; durable locks always begin
  // at the execution aggregate and proceed toward its children.
  const [run] = await db
    .select({
      status: laundryProduction.productionRuns.status,
      productionShiftId: laundryProduction.productionRuns.productionShiftId,
    })
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.id, identity.productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (run === undefined) return null;
  const [shift] = await db
    .select({ status: laundryProduction.productionShifts.status })
    .from(laundryProduction.productionShifts)
    .where(
      and(
        eq(laundryProduction.productionShifts.locationId, locationId),
        eq(laundryProduction.productionShifts.id, run.productionShiftId),
      ),
    )
    .limit(1);
  if (shift === undefined) return null;

  const [batch] = await db
    .select()
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, locationId),
        eq(laundryProduction.productionBatches.id, identity.productionBatchId),
        eq(
          laundryProduction.productionBatches.productionRunId,
          identity.productionRunId,
        ),
      ),
    )
    .limit(1)
    .for('update');
  if (batch === undefined) return null;

  const [stage] = await db
    .select()
    .from(laundryProduction.stageRuns)
    .where(
      and(
        eq(laundryProduction.stageRuns.locationId, locationId),
        eq(laundryProduction.stageRuns.id, identity.stageRunId),
        eq(laundryProduction.stageRuns.productionBatchId, batch.id),
      ),
    )
    .limit(1)
    .for('update');
  if (stage === undefined) return null;
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
  const attemptRows = await db
    .select({
      id: laundryProduction.productionOrderStageAttempts.id,
      status: laundryProduction.productionOrderStageAttempts.status,
    })
    .from(laundryProduction.productionOrderStageAttempts)
    .where(
      and(
        eq(
          laundryProduction.productionOrderStageAttempts.locationId,
          locationId,
        ),
        eq(laundryProduction.productionOrderStageAttempts.stageRunId, stage.id),
      ),
    )
    .for('update');
  const activeMemberships = await db
    .select({
      productionOrderId:
        laundryProduction.productionBatchOrders.productionOrderId,
    })
    .from(laundryProduction.productionBatchOrders)
    .where(
      and(
        eq(laundryProduction.productionBatchOrders.locationId, locationId),
        eq(laundryProduction.productionBatchOrders.productionBatchId, batch.id),
        eq(laundryProduction.productionBatchOrders.active, true),
      ),
    )
    .for('update');
  const activeOrderIds = activeMemberships.map(
    (membership) => membership.productionOrderId,
  );
  const activeOrderRows =
    activeOrderIds.length === 0
      ? []
      : await db
          .select({
            id: laundryProduction.productionOrders.id,
            status: laundryProduction.productionOrders.operationalStatus,
            executionStatus: laundryProduction.productionOrders.executionStatus,
            resolutionState: laundryProduction.productionOrders.resolutionState,
            version: laundryProduction.productionOrders.version,
          })
          .from(laundryProduction.productionOrders)
          .where(
            and(
              eq(laundryProduction.productionOrders.locationId, locationId),
              inArray(laundryProduction.productionOrders.id, activeOrderIds),
            ),
          )
          .for('update');
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
    batch: {
      id: batch.id,
      status: batchStatus(batch.status),
      version: batch.version,
    },
    attempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      status: attemptStatus(attempt.status),
    })),
    activeOrders: activeOrderRows,
    productionRunStatus: run.status,
    productionShiftStatus: shift.status,
    productionRunStarted: run.status === 'started',
    batchMembershipFrozen: batch.membershipFrozenAt !== null,
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
