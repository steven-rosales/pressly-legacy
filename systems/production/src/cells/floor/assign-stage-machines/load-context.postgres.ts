import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type { StageTransitionContext } from '../../../model/stage-context.ts';

const invariant = (code: string, message: string) =>
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
  throw invariant(
    'production_machine_assignment_batch_status_invalid',
    `Unknown production batch status: ${value}.`,
  );
};

const attemptStatus = (
  value: string,
): StageTransitionContext['attempts'][number]['status'] => {
  if (value === 'assigned' || value === 'completed' || value === 'released')
    return value;
  throw invariant(
    'production_machine_assignment_attempt_status_invalid',
    `Unknown order-stage attempt status: ${value}.`,
  );
};

export const loadAssignStageMachinesContext = async (
  db: PostgresExecutor,
  locationId: string,
  stageRunId: string,
  schema: ProductionSchema,
): Promise<StageTransitionContext | null> => {
  const [identity] = await db
    .select({
      stageRunId: schema.stageRuns.id,
      productionBatchId: schema.productionBatches.id,
      productionRunId: schema.productionBatches.productionRunId,
    })
    .from(schema.stageRuns)
    .innerJoin(
      schema.productionBatches,
      and(
        eq(schema.productionBatches.id, schema.stageRuns.productionBatchId),
        eq(schema.productionBatches.locationId, schema.stageRuns.locationId),
      ),
    )
    .where(
      and(
        eq(schema.stageRuns.locationId, locationId),
        eq(schema.stageRuns.id, stageRunId),
      ),
    )
    .limit(1);
  if (identity === undefined) return null;

  const [run] = await db
    .select({
      status: schema.productionRuns.status,
      productionShiftId: schema.productionRuns.productionShiftId,
    })
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, locationId),
        eq(schema.productionRuns.id, identity.productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (run === undefined) return null;

  const [shift] = await db
    .select({ status: schema.productionShifts.status })
    .from(schema.productionShifts)
    .where(
      and(
        eq(schema.productionShifts.locationId, locationId),
        eq(schema.productionShifts.id, run.productionShiftId),
      ),
    )
    .limit(1);
  if (shift === undefined) return null;

  const [batch] = await db
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, locationId),
        eq(schema.productionBatches.id, identity.productionBatchId),
        eq(schema.productionBatches.productionRunId, identity.productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (batch === undefined) return null;

  const [stage] = await db
    .select()
    .from(schema.stageRuns)
    .where(
      and(
        eq(schema.stageRuns.locationId, locationId),
        eq(schema.stageRuns.id, identity.stageRunId),
        eq(schema.stageRuns.productionBatchId, batch.id),
      ),
    )
    .limit(1)
    .for('update');
  if (stage === undefined) return null;

  const siblingStages = await db
    .select()
    .from(schema.stageRuns)
    .where(
      and(
        eq(schema.stageRuns.locationId, locationId),
        eq(schema.stageRuns.productionBatchId, batch.id),
      ),
    )
    .orderBy(asc(schema.stageRuns.plannedStartAt));
  const stageIndex = siblingStages.findIndex(
    (candidate) => candidate.id === stage.id,
  );
  const previous = stageIndex <= 0 ? undefined : siblingStages[stageIndex - 1];

  const attemptRows = await db
    .select({
      id: schema.productionOrderStageAttempts.id,
      status: schema.productionOrderStageAttempts.status,
    })
    .from(schema.productionOrderStageAttempts)
    .where(
      and(
        eq(schema.productionOrderStageAttempts.locationId, locationId),
        eq(schema.productionOrderStageAttempts.stageRunId, stage.id),
      ),
    )
    .for('update');

  const activeMemberships = await db
    .select({
      productionOrderId: schema.productionBatchOrders.productionOrderId,
    })
    .from(schema.productionBatchOrders)
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, locationId),
        eq(schema.productionBatchOrders.productionBatchId, batch.id),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .for('update');
  const activeOrderIds = activeMemberships.map(
    (membership) => membership.productionOrderId,
  );
  const activeOrders =
    activeOrderIds.length === 0
      ? []
      : await db
          .select({
            id: schema.productionOrders.id,
            status: schema.productionOrders.operationalStatus,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
            version: schema.productionOrders.version,
          })
          .from(schema.productionOrders)
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              inArray(schema.productionOrders.id, activeOrderIds),
            ),
          )
          .for('update');

  const allStages = await db
    .select()
    .from(schema.stageRuns)
    .where(eq(schema.stageRuns.locationId, locationId));
  const assignments = await db
    .select()
    .from(schema.stageMachineAssignments)
    .where(eq(schema.stageMachineAssignments.locationId, locationId));
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
    .from(schema.machines)
    .where(eq(schema.machines.locationId, locationId))
    .orderBy(asc(schema.machines.id))
    .for('update');
  const stationRows = await db
    .select()
    .from(schema.stations)
    .where(eq(schema.stations.locationId, locationId));
  const stationKindById = new Map(
    stationRows.map((station) => [station.id, station.kind]),
  );

  return {
    stage: {
      id: stage.id,
      productionBatchId: stage.productionBatchId,
      stage: stage.stageKind as StageTransitionContext['stage']['stage'],
      status: stage.status as StageTransitionContext['stage']['status'],
      plannedStartAt: stage.plannedStartAt.toISOString(),
      plannedEndAt: stage.plannedEndAt.toISOString(),
      actualStartAt: stage.actualStartAt?.toISOString() ?? null,
      machineIds: selectedAssignments.map((assignment) => assignment.machineId),
      version: stage.version,
    },
    batch: {
      id: batch.id,
      status: batchStatus(batch.status),
      version: batch.version,
    },
    attempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      status: attemptStatus(attempt.status),
    })),
    activeOrders,
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
