import type { ProductionScopeReconciliationV1Capability } from '@pressly/access-system/capabilities/production-scope-reconciliation-v1';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
} from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import {
  readRemainingDaySchedulingInput,
  readRemainingDaySchedulingOutput,
} from './schedule-json.ts';
import type {
  LoadRemainingDayForecastRepository,
  LoadRemainingDayForecastRepositoryResult,
  RemainingDayForecastDemandRow,
  RemainingDayPlacementBatch,
} from './types.ts';
import { productionServiceDayWindow } from './window.ts';

const productionInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const asBatchStatus = (
  status: string,
): RemainingDayPlacementBatch['status'] => {
  if (
    status === 'queued' ||
    status === 'sorting' ||
    status === 'washing' ||
    status === 'drying' ||
    status === 'folding_packaging' ||
    status === 'finished'
  )
    return status;
  throw productionInvariant(
    'production_remaining_day_batch_status_invalid',
    `Unknown production batch status: ${status}`,
  );
};

const asStageKind = (
  stage: string,
): RemainingDayPlacementBatch['stages'][number]['stage'] => {
  if (
    stage === 'sorting' ||
    stage === 'washing' ||
    stage === 'drying' ||
    stage === 'folding_packaging'
  )
    return stage;
  throw productionInvariant(
    'production_remaining_day_stage_kind_invalid',
    `Unknown production stage kind: ${stage}`,
  );
};

const asShiftStatus = (status: string): 'draft' | 'open' | 'closed' => {
  if (status === 'draft' || status === 'open' || status === 'closed')
    return status;
  throw productionInvariant(
    'production_remaining_day_shift_status_invalid',
    `Unknown production shift status: ${status}`,
  );
};

const loadReadModel = async (
  database: PostgresExecutor,
  input: {
    locationId: string;
    serviceDay: string;
    asOf: Date;
    rowLimit: number;
  },
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): Promise<LoadRemainingDayForecastRepositoryResult> => {
  const location = await productionScopeReconciliationV1.load({
    locationId: input.locationId,
  });
  if (location?.isActive !== true) return null;

  const range = productionServiceDayWindow({
    timezone: location.timezone,
    asOf: input.asOf,
    serviceDay: input.serviceDay,
  });
  if (range === null) return 'invalid_service_day';

  const demandRows = await database
    .select({
      orderDemandId: schema.orderDemands.id,
      productionOrderId: schema.productionOrders.id,
      displayReference: schema.orderDemands.displayReference,
      admissionState: schema.orderDemands.admissionState,
      phase: schema.orderDemands.phase,
      dueAt: schema.orderDemands.dueAt,
      estimatedWeightLbs: schema.orderDemands.estimatedWeightLbs,
      priority: schema.productionOrders.priority,
      operationalStatus: schema.productionOrders.operationalStatus,
      executionStatus: schema.productionOrders.executionStatus,
      admissionOverride: schema.productionOrders.admissionOverride,
      derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
      bagCount: schema.productionOrders.bagCount,
      productionOrderVersion: schema.productionOrders.version,
    })
    .from(schema.orderDemands)
    .leftJoin(
      schema.productionOrders,
      and(
        eq(schema.productionOrders.orderDemandId, schema.orderDemands.id),
        eq(schema.productionOrders.locationId, schema.orderDemands.locationId),
      ),
    )
    .where(
      and(
        eq(schema.orderDemands.locationId, input.locationId),
        or(
          isNull(schema.productionOrders.id),
          eq(schema.productionOrders.resolutionState, 'open'),
        ),
        inArray(schema.orderDemands.phase, [
          'expected',
          'inbound',
          'production_released',
        ]),
        lt(schema.orderDemands.dueAt, range.endsAt),
      ),
    )
    .orderBy(asc(schema.orderDemands.dueAt), asc(schema.orderDemands.id))
    .limit(input.rowLimit + 1);
  if (demandRows.length > input.rowLimit) return 'scope_too_large';

  const shiftRows = await database
    .select({
      id: schema.productionShifts.id,
      startsAt: schema.productionShifts.startsAt,
      endsAt: schema.productionShifts.endsAt,
      status: schema.productionShifts.status,
    })
    .from(schema.productionShifts)
    .where(
      and(
        eq(schema.productionShifts.locationId, input.locationId),
        lt(schema.productionShifts.startsAt, range.endsAt),
        gt(schema.productionShifts.endsAt, range.startsAt),
      ),
    )
    .orderBy(
      asc(schema.productionShifts.startsAt),
      asc(schema.productionShifts.id),
    )
    .limit(input.rowLimit + 1);
  if (shiftRows.length > input.rowLimit) return 'scope_too_large';
  const shiftIds = shiftRows.map((shift) => shift.id);

  const runRows =
    shiftIds.length === 0
      ? []
      : await database
          .select({
            id: schema.productionRuns.id,
            productionShiftId: schema.productionRuns.productionShiftId,
            queueVersion: schema.productionRuns.queueVersion,
            inputSnapshot: schema.scheduleRuns.inputSnapshot,
            outputPlan: schema.scheduleRuns.outputPlan,
          })
          .from(schema.productionRuns)
          .innerJoin(
            schema.scheduleRuns,
            and(
              eq(schema.scheduleRuns.id, schema.productionRuns.scheduleRunId),
              eq(
                schema.scheduleRuns.locationId,
                schema.productionRuns.locationId,
              ),
            ),
          )
          .where(
            and(
              eq(schema.productionRuns.locationId, input.locationId),
              eq(schema.productionRuns.status, 'started'),
              inArray(schema.productionRuns.productionShiftId, shiftIds),
            ),
          )
          .orderBy(asc(schema.productionRuns.id))
          .limit(input.rowLimit + 1);
  if (runRows.length > input.rowLimit) return 'scope_too_large';

  const runIds = runRows.map((run) => run.id);
  if (runIds.length === 0)
    return {
      locationId: location.id,
      timezone: location.timezone,
      serviceDay: input.serviceDay,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      asOf: input.asOf,
      demandRows: demandRows.map(
        (row): RemainingDayForecastDemandRow => ({
          ...row,
          priority: row.priority ?? false,
          activePlacement: null,
        }),
      ),
      shifts: shiftRows.map((shift) => ({
        productionShiftId: shift.id,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        status: asShiftStatus(shift.status),
        activeRunId: null,
      })),
      activeRuns: [],
    };

  const batchRows = await database
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, input.locationId),
        inArray(schema.productionBatches.productionRunId, runIds),
      ),
    )
    .orderBy(
      asc(schema.productionBatches.productionRunId),
      asc(schema.productionBatches.sequenceIndex),
    )
    .limit(input.rowLimit + 1);
  if (batchRows.length > input.rowLimit) return 'scope_too_large';
  const batchIds = batchRows.map((batch) => batch.id);

  const membershipRows =
    batchIds.length === 0
      ? []
      : await database
          .select({
            productionRunId: schema.productionBatches.productionRunId,
            productionBatchId: schema.productionBatchOrders.productionBatchId,
            orderDemandId: schema.orderDemands.id,
            productionOrderId: schema.productionOrders.id,
            displayReference: schema.orderDemands.displayReference,
            admissionState: schema.orderDemands.admissionState,
            phase: schema.orderDemands.phase,
            dueAt: schema.orderDemands.dueAt,
            estimatedWeightLbs: schema.orderDemands.estimatedWeightLbs,
            priority: schema.productionOrders.priority,
            operationalStatus: schema.productionOrders.operationalStatus,
            executionStatus: schema.productionOrders.executionStatus,
            admissionOverride: schema.productionOrders.admissionOverride,
            derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
            bagCount: schema.productionOrders.bagCount,
            productionOrderVersion: schema.productionOrders.version,
          })
          .from(schema.productionBatchOrders)
          .innerJoin(
            schema.productionBatches,
            and(
              eq(
                schema.productionBatches.id,
                schema.productionBatchOrders.productionBatchId,
              ),
              eq(
                schema.productionBatches.locationId,
                schema.productionBatchOrders.locationId,
              ),
            ),
          )
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
              eq(schema.productionBatchOrders.locationId, input.locationId),
              inArray(schema.productionBatchOrders.productionBatchId, batchIds),
              eq(schema.productionBatchOrders.active, true),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          )
          .orderBy(
            asc(schema.productionBatches.productionRunId),
            asc(schema.productionBatches.sequenceIndex),
            asc(schema.productionOrders.id),
          )
          .limit(input.rowLimit + 1);
  if (membershipRows.length > input.rowLimit) return 'scope_too_large';

  const stageRows =
    batchIds.length === 0
      ? []
      : await database
          .select()
          .from(schema.stageRuns)
          .where(
            and(
              eq(schema.stageRuns.locationId, input.locationId),
              inArray(schema.stageRuns.productionBatchId, batchIds),
            ),
          )
          .orderBy(
            asc(schema.stageRuns.productionBatchId),
            asc(schema.stageRuns.plannedStartAt),
          )
          .limit(input.rowLimit * 4 + 1);
  if (stageRows.length > input.rowLimit * 4) return 'scope_too_large';

  const stageIds = stageRows.map((stage) => stage.id);
  const assignmentRows =
    stageIds.length === 0
      ? []
      : await database
          .select()
          .from(schema.stageMachineAssignments)
          .where(
            and(
              eq(schema.stageMachineAssignments.locationId, input.locationId),
              inArray(schema.stageMachineAssignments.stageRunId, stageIds),
            ),
          )
          .orderBy(
            asc(schema.stageMachineAssignments.stageRunId),
            asc(schema.stageMachineAssignments.machineId),
          )
          .limit(input.rowLimit * 16 + 1);
  if (assignmentRows.length > input.rowLimit * 16) return 'scope_too_large';

  const activePlacementByOrderId = new Map(
    membershipRows.map((membership) => [
      membership.productionOrderId,
      {
        productionRunId: membership.productionRunId,
        productionBatchId: membership.productionBatchId,
      },
    ]),
  );
  const rowsByDemandId = new Map<string, RemainingDayForecastDemandRow>();
  for (const row of demandRows)
    rowsByDemandId.set(row.orderDemandId, {
      ...row,
      priority: row.priority ?? false,
      activePlacement:
        row.productionOrderId === null
          ? null
          : (activePlacementByOrderId.get(row.productionOrderId) ?? null),
    });
  for (const row of membershipRows)
    rowsByDemandId.set(row.orderDemandId, {
      orderDemandId: row.orderDemandId,
      productionOrderId: row.productionOrderId,
      displayReference: row.displayReference,
      admissionState: row.admissionState,
      phase: row.phase,
      dueAt: row.dueAt,
      estimatedWeightLbs: row.estimatedWeightLbs,
      priority: row.priority,
      operationalStatus: row.operationalStatus,
      executionStatus: row.executionStatus,
      admissionOverride: row.admissionOverride,
      derivedWeightLbs: row.derivedWeightLbs,
      bagCount: row.bagCount,
      productionOrderVersion: row.productionOrderVersion,
      activePlacement: {
        productionRunId: row.productionRunId,
        productionBatchId: row.productionBatchId,
      },
    });
  if (rowsByDemandId.size > input.rowLimit) return 'scope_too_large';

  const activeRuns = runRows.map((run) => {
    const snapshot = readRemainingDaySchedulingInput(run.inputSnapshot);
    const output = readRemainingDaySchedulingOutput(run.outputPlan);
    return {
      run: {
        id: run.id,
        queueVersion: run.queueVersion,
        startsAt: snapshot.shift.startsAt,
        shiftEndsAt: snapshot.shift.endsAt,
        pulseMinutes: output.pulseMinutes,
        pulseCapacityLbs: output.pulseCapacityLbs,
      },
      machines: snapshot.machines.map((machine) => ({ ...machine })),
      batches: batchRows
        .filter((batch) => batch.productionRunId === run.id)
        .map((batch) => {
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
    };
  });

  return {
    locationId: location.id,
    timezone: location.timezone,
    serviceDay: input.serviceDay,
    startsAt: range.startsAt,
    endsAt: range.endsAt,
    asOf: input.asOf,
    demandRows: [...rowsByDemandId.values()].sort(
      (left, right) =>
        left.dueAt.getTime() - right.dueAt.getTime() ||
        left.orderDemandId.localeCompare(right.orderDemandId),
    ),
    shifts: shiftRows.map((shift) => ({
      productionShiftId: shift.id,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      status: asShiftStatus(shift.status),
      activeRunId:
        runRows.find((run) => run.productionShiftId === shift.id)?.id ?? null,
    })),
    activeRuns,
  };
};

export const makeLoadRemainingDayForecastPostgresRepository = (
  database: PostgresDatabase,
  schema: ProductionSchema,
  productionScopeReconciliationV1: ProductionScopeReconciliationV1Capability,
): LoadRemainingDayForecastRepository => ({
  load: (input) =>
    database.transaction(
      (transaction) =>
        loadReadModel(
          transaction,
          input,
          schema,
          productionScopeReconciliationV1,
        ),
      {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      },
    ),
});
