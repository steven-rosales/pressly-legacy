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
  OnlinePlacementInput,
  ProductionOrderPlacementContext,
  ProductionRunPlacementContext,
} from '../scheduling/online-placement.port.ts';
import type {
  SchedulingInput,
  SchedulingOutput,
} from '../scheduling/production-scheduling.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export type ProductionPlacementRunRow = Readonly<{
  id: string;
  scheduleRunId: string;
  status: string;
  queueVersion: number;
}>;

export type ProductionPlacementOrderRow = Readonly<{
  id: string;
  priority: boolean;
  derivedWeightLbs: number;
  bagCount: number | null;
  operationalStatus: string;
  executionStatus: string;
  version: number;
}>;

const asBatchStatus = (
  status: string,
): OnlinePlacementInput['batches'][number]['status'] => {
  switch (status) {
    case 'queued':
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
    case 'finished':
      return status;
    default:
      throw productionInvariantViolation(
        'production_placement_context_batch_status_invalid',
        `Unknown production batch status: ${status}.`,
      );
  }
};

const asStageKind = (
  stage: string,
): OnlinePlacementInput['batches'][number]['stages'][number]['stage'] => {
  switch (stage) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return stage;
    default:
      throw productionInvariantViolation(
        'production_placement_context_stage_kind_invalid',
        `Unknown production stage kind: ${stage}.`,
      );
  }
};

export const loadProductionPlacementRun = async (
  db: DatabaseExecutor,
  locationId: string,
  productionRunId: string,
  lock: boolean,
): Promise<ProductionPlacementRunRow | null> => {
  const query = db
    .select({
      id: laundryProduction.productionRuns.id,
      scheduleRunId: laundryProduction.productionRuns.scheduleRunId,
      status: laundryProduction.productionRuns.status,
      queueVersion: laundryProduction.productionRuns.queueVersion,
    })
    .from(laundryProduction.productionRuns)
    .where(
      and(
        eq(laundryProduction.productionRuns.locationId, locationId),
        eq(laundryProduction.productionRuns.id, productionRunId),
      ),
    )
    .limit(1);

  const rows = lock ? await query.for('update') : await query;

  return rows[0] ?? null;
};

export const loadProductionPlacementOrder = async (
  db: DatabaseExecutor,
  locationId: string,
  productionOrderId: string,
  lock: boolean,
): Promise<ProductionPlacementOrderRow | null> => {
  const query = db
    .select({
      id: laundryProduction.productionOrders.id,
      priority: laundryProduction.productionOrders.priority,
      derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
      bagCount: laundryProduction.productionOrders.bagCount,
      operationalStatus: laundryProduction.productionOrders.operationalStatus,
      executionStatus: laundryProduction.productionOrders.executionStatus,
      version: laundryProduction.productionOrders.version,
    })
    .from(laundryProduction.productionOrders)
    .where(
      and(
        eq(laundryProduction.productionOrders.locationId, locationId),
        eq(laundryProduction.productionOrders.id, productionOrderId),
        eq(laundryProduction.productionOrders.resolutionState, 'open'),
      ),
    )
    .limit(1);

  const rows = lock ? await query.for('update') : await query;

  return rows[0] ?? null;
};

export const loadProductionRunPlacementContext = async (
  db: DatabaseExecutor,
  locationId: string,
  run: ProductionPlacementRunRow,
  lockBatches: boolean,
): Promise<ProductionRunPlacementContext | null> => {
  const [schedule] = await db
    .select({
      inputSnapshot: laundryProduction.scheduleRuns.inputSnapshot,
      outputPlan: laundryProduction.scheduleRuns.outputPlan,
    })
    .from(laundryProduction.scheduleRuns)
    .where(
      and(
        eq(laundryProduction.scheduleRuns.locationId, locationId),
        eq(laundryProduction.scheduleRuns.id, run.scheduleRunId),
      ),
    )
    .limit(1);
  if (schedule === undefined) return null;

  const snapshot = schedule.inputSnapshot as SchedulingInput;
  const originalPlan = schedule.outputPlan as SchedulingOutput;

  const batchQuery = db
    .select()
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, locationId),
        eq(laundryProduction.productionBatches.productionRunId, run.id),
      ),
    )
    .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));

  const batchRows = lockBatches
    ? await batchQuery.for('update')
    : await batchQuery;
  if (batchRows.length === 0) return null;

  const batchIds = batchRows.map((batch) => batch.id);

  const [membershipRows, stageRows] = await Promise.all([
    db
      .select({
        productionBatchId:
          laundryProduction.productionBatchOrders.productionBatchId,
        productionOrderId:
          laundryProduction.productionBatchOrders.productionOrderId,
        priority: laundryProduction.productionOrders.priority,
        bagCount: laundryProduction.productionOrders.bagCount,
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
          eq(laundryProduction.productionBatchOrders.locationId, locationId),
          inArray(
            laundryProduction.productionBatchOrders.productionBatchId,
            batchIds,
          ),
          eq(laundryProduction.productionOrders.resolutionState, 'open'),
          eq(laundryProduction.productionBatchOrders.active, true),
        ),
      ),
    db
      .select()
      .from(laundryProduction.stageRuns)
      .where(
        and(
          eq(laundryProduction.stageRuns.locationId, locationId),
          inArray(laundryProduction.stageRuns.productionBatchId, batchIds),
        ),
      )
      .orderBy(asc(laundryProduction.stageRuns.plannedStartAt)),
  ]);

  const stageIds = stageRows.map((stage) => stage.id);

  const assignmentRows =
    stageIds.length === 0
      ? []
      : await db
          .select()
          .from(laundryProduction.stageMachineAssignments)
          .where(
            and(
              eq(
                laundryProduction.stageMachineAssignments.locationId,
                locationId,
              ),
              inArray(
                laundryProduction.stageMachineAssignments.stageRunId,
                stageIds,
              ),
            ),
          );

  return {
    input: {
      run: {
        id: run.id,
        queueVersion: run.queueVersion,
        startsAt: snapshot.shift.startsAt,
        shiftEndsAt: snapshot.shift.endsAt,
        pulseMinutes: originalPlan.pulseMinutes,
        pulseCapacityLbs: originalPlan.pulseCapacityLbs,
      },
      machines: snapshot.machines.map((machine) => ({ ...machine })),
      batches: batchRows.map((batch) => {
        const memberships = membershipRows.filter(
          (membership) => membership.productionBatchId === batch.id,
        );
        return {
          id: batch.id,
          sequence: batch.sequenceIndex,
          status: asBatchStatus(batch.status),
          membershipFrozen: batch.membershipFrozenAt !== null,
          orderIds: memberships.map(
            (membership) => membership.productionOrderId,
          ),
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
              stage: asStageKind(stage.stageKind),
              startsAt: stage.plannedStartAt.toISOString(),
              endsAt: stage.plannedEndAt.toISOString(),
              machineIds: assignmentRows
                .filter((assignment) => assignment.stageRunId === stage.id)
                .map((assignment) => assignment.machineId),
            })),
        };
      }),
    },
    runStatus: run.status,
    batchVersions: Object.fromEntries(
      batchRows.map((batch) => [batch.id, batch.version]),
    ),
    assignedOrderIds: membershipRows.map(
      (membership) => membership.productionOrderId,
    ),
  };
};

export const makeProductionOrderPlacementContext = (
  runContext: ProductionRunPlacementContext,
  order: ProductionPlacementOrderRow,
  orderAlreadyAssigned = runContext.assignedOrderIds.includes(order.id),
): ProductionOrderPlacementContext | null =>
  order.bagCount === null
    ? null
    : {
        input: {
          ...runContext.input,
          order: {
            id: order.id,
            priority: order.priority,
            derivedWeightLbs: order.derivedWeightLbs,
            bagCount: order.bagCount,
            version: order.version,
          },
          mode: { type: 'automatic' },
        },
        runStatus: runContext.runStatus,
        orderStatus: order.operationalStatus,
        orderExecutionStatus: order.executionStatus,
        orderVersion: order.version,
        orderAlreadyAssigned,
        batchVersions: runContext.batchVersions,
      };
