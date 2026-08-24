import { isJsonObject, type JsonValue } from '@pressly/codec';
import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, asc, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { acceptanceScheduleCoversInputExactly } from './decide.ts';
import type {
  AcceptScheduleRepository,
  AcceptScheduleTransactionRepository,
} from './execute.ts';
import type { StoredAcceptScheduleWorkEvent } from './idempotency.ts';
import type {
  ScheduleProposal,
  ScheduleWarningCode,
  SchedulingInput,
  SchedulingOutput,
} from './types.ts';
import {
  appendAcceptScheduleWorkEvent,
  findAcceptScheduleWorkEvent,
} from './work-event.postgres.ts';

const warningCodes = new Set<ScheduleWarningCode>([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

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

const isSchedulingOrder = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isString(value['externalOrderId']) &&
  isString(value['dueAt']) &&
  isBoolean(value['priority']) &&
  isNumber(value['derivedWeightLbs']) &&
  isNumber(value['bagCount']) &&
  isNumber(value['version']);

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

const isSchedulingConfig = (value: JsonValue | undefined): boolean =>
  isJsonObject(value) &&
  isString(value['id']) &&
  isNumber(value['pulseMinutes']) &&
  isNumber(value['foldLbsPerFolderMinute']) &&
  value['algorithmVersion'] === 'fixed-pulse-ffd-v2' &&
  isNumber(value['version']);

const isSchedulingInput = (value: unknown): value is SchedulingInput =>
  isJsonObject(value) &&
  Array.isArray(value['orders']) &&
  value['orders'].every(isSchedulingOrder) &&
  Array.isArray(value['machines']) &&
  value['machines'].every(isSchedulingMachine) &&
  isSchedulingShift(value['shift']) &&
  isSchedulingConfig(value['config']);

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

const isSchedulingWarning = (value: JsonValue): boolean =>
  isJsonObject(value) &&
  isString(value['code']) &&
  warningCodes.has(value['code'] as ScheduleWarningCode) &&
  isString(value['message']) &&
  isBoolean(value['blocking']) &&
  (value['orderIds'] === undefined || isStringArray(value['orderIds']));

const isSchedulingOutput = (value: unknown): value is SchedulingOutput =>
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
  Array.isArray(value['warnings']) &&
  value['warnings'].every(isSchedulingWarning);

const invalidScheduleJson = (field: 'input_snapshot' | 'output_plan') =>
  invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field.replace('_', ' ')} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });

const readSchedulingInput = (value: unknown): SchedulingInput => {
  if (!isSchedulingInput(value)) throw invalidScheduleJson('input_snapshot');
  return value;
};

const readSchedulingOutput = (value: unknown): SchedulingOutput => {
  if (!isSchedulingOutput(value)) throw invalidScheduleJson('output_plan');
  return value;
};

const invalidStoredScheduleField = (field: string): never => {
  throw invariantViolationError({
    code: `production_schedule_${field}_invalid`,
    message: `Stored production schedule ${field} is invalid.`,
    safeMessage: 'Stored production scheduling state is inconsistent.',
  });
};

const mapAcknowledgedWarningCodes = (
  value: unknown,
): readonly ScheduleWarningCode[] => {
  if (
    !Array.isArray(value) ||
    !value.every(
      (code) =>
        typeof code === 'string' &&
        warningCodes.has(code as ScheduleWarningCode),
    )
  )
    return invalidStoredScheduleField('acknowledged_warning_codes');
  return value as ScheduleWarningCode[];
};

const mapSchedule = (
  row: ProductionSchema['scheduleRuns']['$inferSelect'],
): ScheduleProposal => {
  const output = readSchedulingOutput(row.outputPlan);
  return {
    scheduleRunId: row.id,
    productionShiftId: row.productionShiftId,
    schedulerConfigId: row.schedulerConfigId,
    status: row.status as ScheduleProposal['status'],
    inputSnapshotHash: row.inputSnapshotHash,
    outputPlanHash: row.outputPlanHash,
    algorithmVersion:
      row.algorithmVersion as ScheduleProposal['algorithmVersion'],
    pulseMinutes: output.pulseMinutes,
    pulseCapacityLbs: row.pulseCapacityLbs,
    batchCount: row.batchCount,
    makespanMinutes: row.makespanMinutes,
    plannedCompletionAt: row.plannedCompletionAt.toISOString(),
    batches: output.batches.map((batch) => ({
      ...batch,
      orderIds: [...batch.orderIds],
      stages: batch.stages.map((stage) => ({
        ...stage,
        machineIds: [...stage.machineIds],
      })),
    })),
    unplacedOrderIds: [...output.unplacedOrderIds],
    warnings: output.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
      blocking: warning.blocking,
      ...(warning.orderIds === undefined
        ? {}
        : { orderIds: [...warning.orderIds] }),
    })),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    acceptedBy: row.acceptedBy,
    acknowledgedWarningCodes: [
      ...mapAcknowledgedWarningCodes(row.acknowledgedWarningCodes),
    ],
    supersededAt: row.supersededAt?.toISOString() ?? null,
  };
};

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

export type AcceptSchedulePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeAcceptSchedulePostgresRepository = (
  deps: AcceptSchedulePostgresDependencies,
  schema: ProductionSchema,
): AcceptScheduleRepository<StoredAcceptScheduleWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): AcceptScheduleTransactionRepository<StoredAcceptScheduleWorkEvent> => ({
      findWorkEvent: (key) => findAcceptScheduleWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      loadSchedule: async (locationId, scheduleRunId) => {
        const [row] = await db
          .select()
          .from(schema.scheduleRuns)
          .where(
            and(
              eq(schema.scheduleRuns.locationId, locationId),
              eq(schema.scheduleRuns.id, scheduleRunId),
            ),
          )
          .limit(1)
          .for('update');
        return row === undefined
          ? null
          : {
              schedule: mapSchedule(row),
              inputSnapshot: readSchedulingInput(row.inputSnapshot),
            };
      },
      productionRunExists: async (locationId, productionShiftId) => {
        const [run] = await db
          .select({ id: schema.productionRuns.id })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.productionShiftId, productionShiftId),
            ),
          )
          .limit(1);
        return run !== undefined;
      },
      lockAndValidateScheduleInput: async (locationId, record) => {
        const snapshots = new Map(
          record.inputSnapshot.orders.map((order) => [order.id, order]),
        );
        if (
          !acceptanceScheduleCoversInputExactly(
            record.schedule,
            record.inputSnapshot,
          )
        )
          return false;

        const selectedRows = await db
          .select({
            id: schema.productionShiftSelectedOrders.productionOrderId,
          })
          .from(schema.productionShiftSelectedOrders)
          .where(
            and(
              eq(schema.productionShiftSelectedOrders.locationId, locationId),
              eq(
                schema.productionShiftSelectedOrders.productionShiftId,
                record.schedule.productionShiftId,
              ),
            ),
          )
          .orderBy(asc(schema.productionShiftSelectedOrders.productionOrderId));
        const selectedOrderIds = selectedRows.map((row) => row.id);
        if (
          selectedOrderIds.length === 0 ||
          selectedOrderIds.length !== snapshots.size
        )
          return false;

        const rows = await db
          .select({
            id: schema.productionOrders.id,
            locationId: schema.productionOrders.locationId,
            status: schema.productionOrders.operationalStatus,
            version: schema.productionOrders.version,
            derivedWeightLbs: schema.productionOrders.derivedWeightLbs,
            bagCount: schema.productionOrders.bagCount,
            priority: schema.productionOrders.priority,
            dueAt: schema.productionOrders.dueAt,
          })
          .from(schema.productionOrders)
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              inArray(schema.productionOrders.id, selectedOrderIds),
            ),
          )
          .orderBy(asc(schema.productionOrders.id))
          .for('update');
        if (rows.length !== snapshots.size) return false;

        return rows.every((order) => {
          const snapshot = snapshots.get(order.id);
          return (
            snapshot !== undefined &&
            order.locationId === locationId &&
            order.status === 'eligible' &&
            order.bagCount !== null &&
            order.version === snapshot.version &&
            order.derivedWeightLbs === snapshot.derivedWeightLbs &&
            order.bagCount === snapshot.bagCount &&
            order.priority === snapshot.priority &&
            order.dueAt.toISOString() === snapshot.dueAt
          );
        });
      },
      acceptSchedule: async ({
        locationId,
        record,
        actorId,
        acknowledgedWarningCodes,
        idempotencyKey,
        idempotency,
        lifecycle,
        now,
      }) => {
        const persistedWarningCodes = [...acknowledgedWarningCodes].sort();
        const [accepted] = await db
          .update(schema.scheduleRuns)
          .set({
            status: lifecycle.state,
            acceptedAt: now,
            acceptedBy: actorId,
            acknowledgedWarningCodes: persistedWarningCodes,
          })
          .where(
            and(
              eq(schema.scheduleRuns.locationId, locationId),
              eq(schema.scheduleRuns.id, record.schedule.scheduleRunId),
              eq(schema.scheduleRuns.status, lifecycle.from),
            ),
          )
          .returning({
            scheduleRunId: schema.scheduleRuns.id,
            productionShiftId: schema.scheduleRuns.productionShiftId,
            acceptedAt: schema.scheduleRuns.acceptedAt,
          });
        if (accepted === undefined) return { kind: 'conflict' };
        if (accepted.acceptedAt === null)
          throw invariantViolationError({
            code: 'production_schedule_acceptance_timestamp_missing',
            message:
              'An accepted Production schedule did not return its acceptance timestamp.',
            safeMessage: 'The accepted Production schedule is inconsistent.',
          });

        const acceptedResult = {
          scheduleRunId: accepted.scheduleRunId,
          productionShiftId: accepted.productionShiftId,
          acceptedAt: accepted.acceptedAt.toISOString(),
          replayed: false,
        };
        await appendAcceptScheduleWorkEvent(db, schema, deps.ids, {
          locationId,
          scheduleRunId: record.schedule.scheduleRunId,
          actorId,
          idempotencyKey,
          acknowledgedWarningCodes: persistedWarningCodes,
          idempotency,
          result: acceptedResult,
        });
        return { kind: 'accepted', result: acceptedResult };
      },
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;
  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
