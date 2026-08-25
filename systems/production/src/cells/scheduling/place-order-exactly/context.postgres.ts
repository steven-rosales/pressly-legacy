import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  readOnlineOrderPlacementScheduleInput,
  readOnlineOrderPlacementScheduleOutput,
} from '../../../postgres/online-order-placement/schedule-snapshot.postgres.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementBatchStatus,
  OnlinePlacementStageKind,
  ProductionOrderPlacementContext,
} from '../../../model/online-order-placement/model.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const batchStatus = (value: string): OnlinePlacementBatchStatus => {
  switch (value) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return value;
    default:
      throw invariant(
        'production_placement_context_batch_status_invalid',
        `Unknown production batch status: ${value}.`,
      );
  }
};

const stageKind = (value: string): OnlinePlacementStageKind => {
  switch (value) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return value;
    default:
      throw invariant(
        'production_placement_context_stage_kind_invalid',
        `Unknown production stage kind: ${value}.`,
      );
  }
};

/**
 * Exact placement keeps its established selected-column and parallel graph
 * reads here. Automatic placement and overtime confirmation share the other
 * SQL-identical locked reader in the Production Postgres owner.
 */
export const loadPlaceOrderExactlyContext = async (
  database: PostgresExecutor,
  input: Readonly<{
    locationId: string;
    productionRunId: string;
    productionOrderId: string;
  }>,
  schema: ProductionSchema,
): Promise<ProductionOrderPlacementContext | null> => {
  const [run] = await database
    .select({
      id: schema.productionRuns.id,
      scheduleRunId: schema.productionRuns.scheduleRunId,
      status: schema.productionRuns.status,
      queueVersion: schema.productionRuns.queueVersion,
    })
    .from(schema.productionRuns)
    .where(
      and(
        eq(schema.productionRuns.locationId, input.locationId),
        eq(schema.productionRuns.id, input.productionRunId),
      ),
    )
    .limit(1)
    .for('update');
  if (run === undefined) return null;

  const [order] = await database
    .select({
      id: schema.productionOrders.id,
      priority: schema.productionOrders.priority,
      derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
      bagCount: schema.productionOrders.bagCount,
      operationalStatus: schema.productionOrders.operationalStatus,
      executionStatus: schema.productionOrders.executionStatus,
      version: schema.productionOrders.version,
    })
    .from(schema.productionOrders)
    .where(
      and(
        eq(schema.productionOrders.locationId, input.locationId),
        eq(schema.productionOrders.id, input.productionOrderId),
        eq(schema.productionOrders.resolutionState, 'open'),
      ),
    )
    .limit(1)
    .for('update');
  if (order === undefined) return null;

  const [schedule] = await database
    .select({
      inputSnapshot: schema.scheduleRuns.inputSnapshot,
      outputPlan: schema.scheduleRuns.outputPlan,
    })
    .from(schema.scheduleRuns)
    .where(
      and(
        eq(schema.scheduleRuns.locationId, input.locationId),
        eq(schema.scheduleRuns.id, run.scheduleRunId),
      ),
    )
    .limit(1);
  if (schedule === undefined) return null;
  const snapshot = readOnlineOrderPlacementScheduleInput(
    schedule.inputSnapshot,
  );
  const originalPlan = readOnlineOrderPlacementScheduleOutput(
    schedule.outputPlan,
  );

  const batchRows = await database
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, input.locationId),
        eq(schema.productionBatches.productionRunId, run.id),
      ),
    )
    .orderBy(asc(schema.productionBatches.sequenceIndex))
    .for('update');
  if (batchRows.length === 0) return null;
  const batchIds = batchRows.map((batch) => batch.id);

  const [membershipRows, stageRows] = await Promise.all([
    database
      .select({
        productionBatchId: schema.productionBatchOrders.productionBatchId,
        productionOrderId: schema.productionBatchOrders.productionOrderId,
        priority: schema.productionOrders.priority,
        bagCount: schema.productionOrders.bagCount,
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
          eq(schema.productionBatchOrders.locationId, input.locationId),
          inArray(schema.productionBatchOrders.productionBatchId, batchIds),
          eq(schema.productionOrders.resolutionState, 'open'),
          eq(schema.productionBatchOrders.active, true),
        ),
      ),
    database
      .select()
      .from(schema.stageRuns)
      .where(
        and(
          eq(schema.stageRuns.locationId, input.locationId),
          inArray(schema.stageRuns.productionBatchId, batchIds),
        ),
      )
      .orderBy(asc(schema.stageRuns.plannedStartAt)),
  ]);
  const stageIds = stageRows.map((stage) => stage.id);

  const assignmentRows =
    stageIds.length === 0
      ? []
      : await database
          .select({
            id: schema.stageMachineAssignments.id,
            stageRunId: schema.stageMachineAssignments.stageRunId,
            machineId: schema.stageMachineAssignments.machineId,
          })
          .from(schema.stageMachineAssignments)
          .where(
            and(
              eq(schema.stageMachineAssignments.locationId, input.locationId),
              inArray(schema.stageMachineAssignments.stageRunId, stageIds),
            ),
          );

  const [existingMembership] = await database
    .select({ id: schema.productionBatchOrders.id })
    .from(schema.productionBatchOrders)
    .where(
      and(
        eq(schema.productionBatchOrders.locationId, input.locationId),
        eq(
          schema.productionBatchOrders.productionOrderId,
          input.productionOrderId,
        ),
        eq(schema.productionBatchOrders.active, true),
      ),
    )
    .limit(1);

  if (order.bagCount === null) return null;
  const batches: OnlinePlacementInput['batches'] = batchRows.map((batch) => {
    const memberships = membershipRows.filter(
      (membership) => membership.productionBatchId === batch.id,
    );
    return {
      id: batch.id,
      sequence: batch.sequenceIndex,
      status: batchStatus(batch.status),
      membershipFrozen: batch.membershipFrozenAt !== null,
      orderIds: memberships.map((membership) => membership.productionOrderId),
      priorityOrderIds: memberships
        .filter((membership) => membership.priority)
        .map((membership) => membership.productionOrderId),
      derivedWeightLbs: batch.derivedWeightLbs,
      bagCount: memberships.reduce(
        (total, membership) => total + (membership.bagCount ?? 0),
        0,
      ),
      stages: stageRows
        .filter((stage) => stage.productionBatchId === batch.id)
        .map((stage) => ({
          stage: stageKind(stage.stageKind),
          startsAt: stage.plannedStartAt.toISOString(),
          endsAt: stage.plannedEndAt.toISOString(),
          machineIds: assignmentRows
            .filter((assignment) => assignment.stageRunId === stage.id)
            .map((assignment) => assignment.machineId),
        })),
    };
  });

  return {
    input: {
      order: {
        id: order.id,
        priority: order.priority,
        derivedWeightLbs: order.derivedWeightLbs,
        bagCount: order.bagCount,
        version: order.version,
      },
      run: {
        id: run.id,
        queueVersion: run.queueVersion,
        startsAt: snapshot.shift.startsAt,
        shiftEndsAt: snapshot.shift.endsAt,
        pulseMinutes: originalPlan.pulseMinutes,
        pulseCapacityLbs: originalPlan.pulseCapacityLbs,
      },
      machines: snapshot.machines.map((machine) => ({ ...machine })),
      batches,
    },
    runStatus: run.status,
    orderStatus: order.operationalStatus,
    orderExecutionStatus: order.executionStatus,
    orderVersion: order.version,
    orderAlreadyAssigned: existingMembership !== undefined,
    batchVersions: Object.fromEntries(
      batchRows.map((batch) => [batch.id, batch.version]),
    ),
  };
};
