import { and, asc, eq, gt, inArray, isNull, lt, or } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { invariantViolationError } from '@pressly/errors/factories';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import {
  calendarDateAt,
  calendarDayDistance,
  calendarDayRangeAt,
  instantFromDate,
} from '@pressly/time';
import type { OnlinePlacementInput } from '../../../foundations/language/scheduling/online-placement.model.ts';
import {
  readSchedulingInput,
  readSchedulingOutput,
} from '../../../foundations/adapters/postgres/scheduling/production-schedule-json.persistence.mapper.ts';
import type {
  RemainingDayForecastDemandRow,
  RemainingDayForecastReadModel,
} from './load-remaining-day-forecast.model.ts';
import type { LoadRemainingDayForecastRepository } from './load-remaining-day-forecast.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const parseServiceDay = (
  value: string,
): Readonly<{ year: number; month: number; day: number }> | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));

  return normalized.getUTCFullYear() === year &&
    normalized.getUTCMonth() + 1 === month &&
    normalized.getUTCDate() === day
    ? { year, month, day }
    : null;
};

const serviceDayRange = (
  timezone: string,
  asOf: Date,
  serviceDay: string,
): Readonly<{ startsAt: Date; endsAt: Date }> | null => {
  const selectedDate = parseServiceDay(serviceDay);
  if (selectedDate === null) return null;

  const reference = instantFromDate(asOf);
  const dayOffset = calendarDayDistance({
    from: calendarDateAt(timezone, reference),
    to: selectedDate,
  });
  const range = calendarDayRangeAt(timezone, reference, dayOffset);
  if (range.tag === 'err') return null;

  return {
    startsAt: new Date(range.value.startsAt),
    endsAt: new Date(range.value.endsAt),
  };
};

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
        'production_remaining_day_batch_status_invalid',
        `Unknown production batch status: ${status}`,
      );
  }
};

const asStageKind = (
  stageKind: string,
): OnlinePlacementInput['batches'][number]['stages'][number]['stage'] => {
  switch (stageKind) {
    case 'sorting':
    case 'washing':
    case 'drying':
    case 'folding_packaging':
      return stageKind;
    default:
      throw productionInvariantViolation(
        'production_remaining_day_stage_kind_invalid',
        `Unknown production stage kind: ${stageKind}`,
      );
  }
};

const asShiftStatus = (status: string): 'draft' | 'open' | 'closed' => {
  switch (status) {
    case 'draft':
    case 'open':
    case 'closed':
      return status;
    default:
      throw productionInvariantViolation(
        'production_remaining_day_shift_status_invalid',
        `Unknown production shift status: ${status}`,
      );
  }
};

const loadReadModel = async (
  db: DatabaseExecutor,
  input: {
    locationId: string;
    serviceDay: string;
    asOf: Date;
    rowLimit: number;
  },
): Promise<
  | RemainingDayForecastReadModel
  | 'scope_too_large'
  | 'invalid_service_day'
  | null
> => {
  const [location] = await db
    .select({
      id: laundryProduction.productionLocations.id,
      timezone: laundryProduction.productionLocations.timezone,
    })
    .from(laundryProduction.productionLocations)
    .where(
      and(
        eq(laundryProduction.productionLocations.id, input.locationId),
        eq(laundryProduction.productionLocations.isActive, true),
      ),
    )
    .limit(1);
  if (location === undefined) return null;

  const range = serviceDayRange(
    location.timezone,
    input.asOf,
    input.serviceDay,
  );
  if (range === null) return 'invalid_service_day';

  const demandRows = await db
    .select({
      orderDemandId: laundryProduction.orderDemands.id,
      productionOrderId: laundryProduction.productionOrders.id,
      displayReference: laundryProduction.orderDemands.displayReference,
      admissionState: laundryProduction.orderDemands.admissionState,
      phase: laundryProduction.orderDemands.phase,
      dueAt: laundryProduction.orderDemands.dueAt,
      estimatedWeightLbs: laundryProduction.orderDemands.estimatedWeightLbs,
      priority: laundryProduction.productionOrders.priority,
      operationalStatus: laundryProduction.productionOrders.operationalStatus,
      executionStatus: laundryProduction.productionOrders.executionStatus,
      admissionOverride: laundryProduction.productionOrders.admissionOverride,
      derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
      bagCount: laundryProduction.productionOrders.bagCount,
      productionOrderVersion: laundryProduction.productionOrders.version,
    })
    .from(laundryProduction.orderDemands)
    .leftJoin(
      laundryProduction.productionOrders,
      and(
        eq(
          laundryProduction.productionOrders.orderDemandId,
          laundryProduction.orderDemands.id,
        ),
        eq(
          laundryProduction.productionOrders.locationId,
          laundryProduction.orderDemands.locationId,
        ),
      ),
    )
    .where(
      and(
        eq(laundryProduction.orderDemands.locationId, input.locationId),
        or(
          isNull(laundryProduction.productionOrders.id),
          eq(laundryProduction.productionOrders.resolutionState, 'open'),
        ),
        inArray(laundryProduction.orderDemands.phase, [
          'expected',
          'inbound',
          'production_released',
        ]),
        lt(laundryProduction.orderDemands.dueAt, range.endsAt),
      ),
    )
    .orderBy(
      asc(laundryProduction.orderDemands.dueAt),
      asc(laundryProduction.orderDemands.id),
    )
    .limit(input.rowLimit + 1);
  if (demandRows.length > input.rowLimit) return 'scope_too_large';

  const shiftRows = await db
    .select({
      id: laundryProduction.productionShifts.id,
      startsAt: laundryProduction.productionShifts.startsAt,
      endsAt: laundryProduction.productionShifts.endsAt,
      status: laundryProduction.productionShifts.status,
    })
    .from(laundryProduction.productionShifts)
    .where(
      and(
        eq(laundryProduction.productionShifts.locationId, input.locationId),
        lt(laundryProduction.productionShifts.startsAt, range.endsAt),
        gt(laundryProduction.productionShifts.endsAt, range.startsAt),
      ),
    )
    .orderBy(
      asc(laundryProduction.productionShifts.startsAt),
      asc(laundryProduction.productionShifts.id),
    )
    .limit(input.rowLimit + 1);
  if (shiftRows.length > input.rowLimit) return 'scope_too_large';
  const shiftIds = shiftRows.map((shift) => shift.id);

  const runRows =
    shiftIds.length === 0
      ? []
      : await db
          .select({
            id: laundryProduction.productionRuns.id,
            productionShiftId:
              laundryProduction.productionRuns.productionShiftId,
            queueVersion: laundryProduction.productionRuns.queueVersion,
            inputSnapshot: laundryProduction.scheduleRuns.inputSnapshot,
            outputPlan: laundryProduction.scheduleRuns.outputPlan,
          })
          .from(laundryProduction.productionRuns)
          .innerJoin(
            laundryProduction.scheduleRuns,
            and(
              eq(
                laundryProduction.scheduleRuns.id,
                laundryProduction.productionRuns.scheduleRunId,
              ),
              eq(
                laundryProduction.scheduleRuns.locationId,
                laundryProduction.productionRuns.locationId,
              ),
            ),
          )
          .where(
            and(
              eq(laundryProduction.productionRuns.locationId, input.locationId),
              eq(laundryProduction.productionRuns.status, 'started'),
              inArray(
                laundryProduction.productionRuns.productionShiftId,
                shiftIds,
              ),
            ),
          )
          .orderBy(asc(laundryProduction.productionRuns.id))
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

  const batchRows = await db
    .select()
    .from(laundryProduction.productionBatches)
    .where(
      and(
        eq(laundryProduction.productionBatches.locationId, input.locationId),
        inArray(laundryProduction.productionBatches.productionRunId, runIds),
      ),
    )
    .orderBy(
      asc(laundryProduction.productionBatches.productionRunId),
      asc(laundryProduction.productionBatches.sequenceIndex),
    )
    .limit(input.rowLimit + 1);
  if (batchRows.length > input.rowLimit) return 'scope_too_large';

  const batchIds = batchRows.map((batch) => batch.id);
  const membershipRows =
    batchIds.length === 0
      ? []
      : await db
          .select({
            productionRunId:
              laundryProduction.productionBatches.productionRunId,
            productionBatchId:
              laundryProduction.productionBatchOrders.productionBatchId,
            orderDemandId: laundryProduction.orderDemands.id,
            productionOrderId: laundryProduction.productionOrders.id,
            displayReference: laundryProduction.orderDemands.displayReference,
            admissionState: laundryProduction.orderDemands.admissionState,
            phase: laundryProduction.orderDemands.phase,
            dueAt: laundryProduction.orderDemands.dueAt,
            estimatedWeightLbs:
              laundryProduction.orderDemands.estimatedWeightLbs,
            priority: laundryProduction.productionOrders.priority,
            operationalStatus:
              laundryProduction.productionOrders.operationalStatus,
            executionStatus: laundryProduction.productionOrders.executionStatus,
            admissionOverride:
              laundryProduction.productionOrders.admissionOverride,
            derivedWeightLbs:
              laundryProduction.productionOrders.derivedWeightLbs,
            bagCount: laundryProduction.productionOrders.bagCount,
            productionOrderVersion: laundryProduction.productionOrders.version,
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
              eq(
                laundryProduction.productionBatchOrders.locationId,
                input.locationId,
              ),
              inArray(
                laundryProduction.productionBatchOrders.productionBatchId,
                batchIds,
              ),
              eq(laundryProduction.productionBatchOrders.active, true),
              eq(laundryProduction.productionOrders.resolutionState, 'open'),
            ),
          )
          .orderBy(
            asc(laundryProduction.productionBatches.productionRunId),
            asc(laundryProduction.productionBatches.sequenceIndex),
            asc(laundryProduction.productionOrders.id),
          )
          .limit(input.rowLimit + 1);
  if (membershipRows.length > input.rowLimit) return 'scope_too_large';

  const stageRows =
    batchIds.length === 0
      ? []
      : await db
          .select()
          .from(laundryProduction.stageRuns)
          .where(
            and(
              eq(laundryProduction.stageRuns.locationId, input.locationId),
              inArray(laundryProduction.stageRuns.productionBatchId, batchIds),
            ),
          )
          .orderBy(
            asc(laundryProduction.stageRuns.productionBatchId),
            asc(laundryProduction.stageRuns.plannedStartAt),
          )
          .limit(input.rowLimit * 4 + 1);
  if (stageRows.length > input.rowLimit * 4) return 'scope_too_large';

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
                input.locationId,
              ),
              inArray(
                laundryProduction.stageMachineAssignments.stageRunId,
                stageIds,
              ),
            ),
          )
          .orderBy(
            asc(laundryProduction.stageMachineAssignments.stageRunId),
            asc(laundryProduction.stageMachineAssignments.machineId),
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
    const snapshot = readSchedulingInput(run.inputSnapshot);
    const output = readSchedulingOutput(run.outputPlan);

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

export const makeLoadRemainingDayForecastRepository = (
  db: Database,
): LoadRemainingDayForecastRepository => ({
  load: (input) =>
    db.transaction((transaction) => loadReadModel(transaction, input), {
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    }),
});
