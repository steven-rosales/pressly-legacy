import { isJsonObject, type JsonValue } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, asc, eq, inArray } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { invariantViolationError } from '@pressly/errors/factories';
import type {
  OnlinePlacementInput,
  OrderPlacementContext,
  RunPlacementContext,
} from './types.ts';

/** PostgreSQL-backed projection helpers used only by this cell's adapter. */

const productionInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const invalidScheduleJson = (field: 'input_snapshot' | 'output_plan') =>
  invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field.replace('_', ' ')} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });

const isString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string';
const isNumber = (value: JsonValue | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isBoolean = (value: JsonValue | undefined): value is boolean =>
  typeof value === 'boolean';
const isStringArray = (
  value: JsonValue | undefined,
): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isSchedulingMachine = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  (value['stationKind'] === 'washing' || value['stationKind'] === 'drying') &&
  isNumber(value['effectiveCapacityLbs']) &&
  isBoolean(value['active']);

const isSchedulingShift = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isString(value['timezone']) &&
  isNumber(value['effectiveFolderCount']) &&
  isNumber(value['version']);

const isSchedulingInput = (
  value: unknown,
): value is Readonly<{
  machines: OnlinePlacementInput['machines'];
  shift: Readonly<{ startsAt: string; endsAt: string }>;
}> =>
  isJsonObject(value) &&
  Array.isArray(value['orders']) &&
  Array.isArray(value['machines']) &&
  value['machines'].every(isSchedulingMachine) &&
  isSchedulingShift(value['shift']) &&
  isJsonObject(value['config']);

const isSchedulingStage = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  (value['stage'] === 'sorting' ||
    value['stage'] === 'washing' ||
    value['stage'] === 'drying' ||
    value['stage'] === 'folding_packaging') &&
  isString(value['startsAt']) &&
  isString(value['endsAt']) &&
  isStringArray(value['machineIds']);

const isSchedulingBatch = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isNumber(value['sequence']) &&
  isStringArray(value['orderIds']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  Array.isArray(value['stages']) &&
  value['stages'].every(isSchedulingStage);

const isSchedulingOutput = (
  value: unknown,
): value is Readonly<{ pulseMinutes: number; pulseCapacityLbs: number }> =>
  isJsonObject(value) &&
  value['algorithmVersion'] === 'fixed-pulse-ffd-v2' &&
  isString(value['inputSnapshotHash']) &&
  isString(value['outputPlanHash']) &&
  isString(value['canonicalOutput']) &&
  isNumber(value['pulseMinutes']) &&
  isNumber(value['pulseCapacityLbs']) &&
  isNumber(value['batchCount']) &&
  isNumber(value['makespanMinutes']) &&
  isString(value['plannedCompletionAt']) &&
  Array.isArray(value['batches']) &&
  value['batches'].every(isSchedulingBatch) &&
  isStringArray(value['unplacedOrderIds']) &&
  Array.isArray(value['warnings']);

const readSchedulingInput = (value: unknown) => {
  if (!isSchedulingInput(value)) throw invalidScheduleJson('input_snapshot');
  return value;
};

const readSchedulingOutput = (value: unknown) => {
  if (!isSchedulingOutput(value)) throw invalidScheduleJson('output_plan');
  return value;
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
      throw productionInvariant(
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
      throw productionInvariant(
        'production_placement_context_stage_kind_invalid',
        `Unknown production stage kind: ${stage}.`,
      );
  }
};

export type PlacementRunRow = Readonly<{
  id: string;
  scheduleRunId: string;
  status: string;
  queueVersion: number;
}>;

export const loadRunPlacementContext = async (
  database: PostgresExecutor,
  locationId: string,
  run: PlacementRunRow,
  schema: ProductionSchema,
): Promise<RunPlacementContext | null> => {
  const [schedule] = await database
    .select({
      inputSnapshot: schema.scheduleRuns.inputSnapshot,
      outputPlan: schema.scheduleRuns.outputPlan,
    })
    .from(schema.scheduleRuns)
    .where(
      and(
        eq(schema.scheduleRuns.locationId, locationId),
        eq(schema.scheduleRuns.id, run.scheduleRunId),
      ),
    )
    .limit(1);
  if (schedule === undefined) return null;

  const snapshot = readSchedulingInput(schedule.inputSnapshot);
  const originalPlan = readSchedulingOutput(schedule.outputPlan);
  const batchRows = await database
    .select()
    .from(schema.productionBatches)
    .where(
      and(
        eq(schema.productionBatches.locationId, locationId),
        eq(schema.productionBatches.productionRunId, run.id),
      ),
    )
    .orderBy(asc(schema.productionBatches.sequenceIndex));
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
          eq(schema.productionBatchOrders.locationId, locationId),
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
          eq(schema.stageRuns.locationId, locationId),
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
          .select()
          .from(schema.stageMachineAssignments)
          .where(
            and(
              eq(schema.stageMachineAssignments.locationId, locationId),
              inArray(schema.stageMachineAssignments.stageRunId, stageIds),
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

export const makeOrderPlacementContext = (
  runContext: RunPlacementContext,
  order: Readonly<{
    id: string;
    priority: boolean;
    derivedWeightLbs: number;
    bagCount: number | null;
    operationalStatus: string;
    executionStatus: string;
    version: number;
  }>,
  orderAlreadyAssigned = runContext.assignedOrderIds.includes(order.id),
): OrderPlacementContext | null =>
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
