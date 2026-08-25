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
import type {
  PlannedStage,
  ProposedScheduleBatch,
  ScheduleWarningCode,
  SchedulingInput,
} from '../../../model/production-schedule/model.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import {
  readProductionSchedulingInput,
  readProductionSchedulingOutput,
} from '../../../postgres/production-schedule/schedule-json.postgres.ts';
import type {
  StartScheduleRepository,
  StartScheduleTransactionRepository,
} from './execute.ts';
import type { StoredStartScheduleWorkEvent } from './idempotency.ts';
import type { ScheduleStartRecord, StartScheduleResult } from './types.ts';
import {
  appendStartScheduleWorkEvent,
  findStartScheduleWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string, safeMessage?: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: safeMessage ?? 'Production state is inconsistent.',
  });

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

const warningCodes = new Set<ScheduleWarningCode>([
  'SHIFT_OVERFLOW',
  'OVERSIZED_ORDER',
  'NO_ACTIVE_WASHERS',
  'NO_ACTIVE_DRYERS',
  'NO_FOLDING_CAPACITY',
]);

const acknowledgedWarningCodes = (
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
    throw invariant(
      'production_schedule_acknowledged_warning_codes_invalid',
      'Stored production schedule acknowledged_warning_codes is invalid.',
      'Stored production scheduling state is inconsistent.',
    );
  return value as readonly ScheduleWarningCode[];
};

const scheduleCoversInputExactly = (
  schedule: Readonly<{
    batches: readonly ProposedScheduleBatch[];
    unplacedOrderIds: readonly string[];
  }>,
  inputSnapshot: Pick<SchedulingInput, 'orders'>,
): boolean => {
  const snapshotOrderIds = inputSnapshot.orders.map((order) => order.id);
  const plannedOrderIds = [
    ...schedule.batches.flatMap((batch) => batch.orderIds),
    ...schedule.unplacedOrderIds,
  ];
  if (
    new Set(snapshotOrderIds).size !== snapshotOrderIds.length ||
    new Set(plannedOrderIds).size !== plannedOrderIds.length ||
    plannedOrderIds.length !== snapshotOrderIds.length
  )
    return false;
  const snapshotSet = new Set(snapshotOrderIds);
  return plannedOrderIds.every((orderId) => snapshotSet.has(orderId));
};

const mapRecord = (
  row: ProductionSchema['scheduleRuns']['$inferSelect'],
): ScheduleStartRecord => {
  const output = readProductionSchedulingOutput(row.outputPlan);
  return {
    schedule: {
      scheduleRunId: row.id,
      productionShiftId: row.productionShiftId,
      status: row.status,
      outputPlanHash: row.outputPlanHash,
      pulseMinutes: output.pulseMinutes,
      pulseCapacityLbs: row.pulseCapacityLbs,
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
    },
    inputSnapshot: readProductionSchedulingInput(row.inputSnapshot),
    acceptedBy: row.acceptedBy,
    acknowledgedWarningCodes: [
      ...acknowledgedWarningCodes(row.acknowledgedWarningCodes),
    ],
  };
};

export type StartSchedulePostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeStartSchedulePostgresRepository = (
  deps: StartSchedulePostgresDependencies,
  schema: ProductionSchema,
): StartScheduleRepository<StoredStartScheduleWorkEvent> => {
  const native = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): StartScheduleTransactionRepository<StoredStartScheduleWorkEvent> => ({
      findWorkEvent: (key) => findStartScheduleWorkEvent(db, schema, key),
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
        return row === undefined ? null : mapRecord(row);
      },
      lockShiftForStart: async (locationId, productionShiftId) => {
        const [shift] = await db
          .select({ id: schema.productionShifts.id })
          .from(schema.productionShifts)
          .where(
            and(
              eq(schema.productionShifts.locationId, locationId),
              eq(schema.productionShifts.id, productionShiftId),
            ),
          )
          .limit(1)
          .for('update');
        return shift !== undefined;
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
      lockAndLoadStartOrders: async (locationId, record) => {
        const snapshots = new Map(
          record.inputSnapshot.orders.map((order) => [order.id, order]),
        );
        if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
          return null;
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
          return null;
        const rows = await db
          .select({
            id: schema.productionOrders.id,
            operationalStatus: schema.productionOrders.operationalStatus,
            executionStatus: schema.productionOrders.executionStatus,
            resolutionState: schema.productionOrders.resolutionState,
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
        if (rows.length !== snapshots.size) return null;
        const valid = rows.every((order) => {
          const snapshot = snapshots.get(order.id);
          return (
            snapshot !== undefined &&
            order.resolutionState === 'open' &&
            order.operationalStatus === 'eligible' &&
            order.bagCount !== null &&
            order.version === snapshot.version &&
            order.derivedWeightLbs === snapshot.derivedWeightLbs &&
            order.bagCount === snapshot.bagCount &&
            order.priority === snapshot.priority &&
            order.dueAt.toISOString() === snapshot.dueAt
          );
        });
        return valid
          ? rows.map((order) => ({
              id: order.id,
              operationalStatus: order.operationalStatus,
              executionStatus: order.executionStatus,
              version: order.version,
            }))
          : null;
      },
      commitStart: async ({
        locationId,
        record,
        actorId,
        decision,
        idempotencyKey,
        idempotency,
        now,
      }) => {
        const schedule = record.schedule;
        const selectedOrderIds = schedule.batches.flatMap(
          (batch) => batch.orderIds,
        );
        if (selectedOrderIds.length > 0) {
          const lifecycleByOrderId = new Map(
            decision.orderLifecycles.map((order) => [
              order.productionOrderId,
              order,
            ]),
          );
          if (
            lifecycleByOrderId.size !== selectedOrderIds.length ||
            selectedOrderIds.some((orderId) => !lifecycleByOrderId.has(orderId))
          )
            throw invariant(
              'production_schedule_start_order_lifecycle_incomplete',
              'Order execution decisions are incomplete at Start.',
            );
          for (const orderId of selectedOrderIds) {
            const lifecycle = lifecycleByOrderId.get(orderId);
            if (lifecycle === undefined)
              throw invariant(
                'production_schedule_start_order_lifecycle_incomplete',
                'Order execution decisions are incomplete at Start.',
              );
            const [updatedOrder] = await db
              .update(schema.productionOrders)
              .set({
                operationalStatus: lifecycle.lifecycle.state,
                executionStatus: lifecycle.lifecycle.state,
                pendingPlacement: null,
                version: lifecycle.expectedVersion + 1,
                updatedAt: now,
              })
              .where(
                and(
                  eq(schema.productionOrders.locationId, locationId),
                  eq(schema.productionOrders.id, orderId),
                  eq(schema.productionOrders.operationalStatus, 'eligible'),
                  eq(
                    schema.productionOrders.executionStatus,
                    lifecycle.persistedState,
                  ),
                  eq(schema.productionOrders.resolutionState, 'open'),
                  eq(
                    schema.productionOrders.version,
                    lifecycle.expectedVersion,
                  ),
                ),
              )
              .returning({ id: schema.productionOrders.id });
            if (updatedOrder === undefined) return { kind: 'order_conflict' };
          }
        }

        const stationRows = await db
          .select()
          .from(schema.stations)
          .where(eq(schema.stations.locationId, locationId));
        const stationByKind = new Map(
          stationRows.map((station) => [station.kind, station.id]),
        );
        const productionRunId = deps.ids.next();
        const acceptsOvertime =
          record.acknowledgedWarningCodes.includes('SHIFT_OVERFLOW');
        await db.insert(schema.productionRuns).values({
          id: productionRunId,
          locationId,
          productionShiftId: schedule.productionShiftId,
          scheduleRunId: schedule.scheduleRunId,
          status: decision.productionRunStatus,
          startedAt: now,
          queueVersion: 1,
          plannedCompletionAt: new Date(schedule.plannedCompletionAt),
          ...(acceptsOvertime
            ? {
                overtimeProposalHash: schedule.outputPlanHash,
                overtimeQueueVersion: 1,
                overtimeAcknowledgedAt: now,
                overtimeAcknowledgedBy: record.acceptedBy ?? actorId,
              }
            : {}),
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        const productionBatchIds: string[] = [];
        const initialStageAttempts: {
          stageRunId: string;
          stageKind: PlannedStage['stage'];
          productionOrderIds: readonly string[];
        }[] = [];
        for (const proposed of schedule.batches) {
          const finalStage = proposed.stages.at(-1);
          if (finalStage === undefined)
            throw invariant(
              'production_schedule_batch_stages_missing',
              'A Production schedule batch has no planned stages.',
            );
          const productionBatchId = deps.ids.next();
          productionBatchIds.push(productionBatchId);
          await db.insert(schema.productionBatches).values({
            id: productionBatchId,
            locationId,
            productionRunId,
            sequenceIndex: proposed.sequence,
            status: decision.initialBatchState,
            pulseCapacityLbs: schedule.pulseCapacityLbs,
            derivedWeightLbs: proposed.derivedWeightLbs,
            pulseMinutes: schedule.pulseMinutes,
            plannedDoneAt: new Date(finalStage.endsAt),
            version: 1,
            createdAt: now,
            updatedAt: now,
          });
          await db.insert(schema.productionBatchOrders).values(
            proposed.orderIds.map((productionOrderId) => ({
              locationId,
              productionBatchId,
              productionOrderId,
              active: true,
              placementProvenance: 'initial_schedule',
            })),
          );
          for (const proposedStage of proposed.stages) {
            const stationId = stationByKind.get(proposedStage.stage);
            if (stationId === undefined)
              throw invariant(
                'production_schedule_start_station_missing',
                `Station not found: ${proposedStage.stage}.`,
              );
            const stageRunId = deps.ids.next();
            await db.insert(schema.stageRuns).values({
              id: stageRunId,
              locationId,
              productionBatchId,
              stationId,
              stageKind: proposedStage.stage,
              status: decision.initialStageState,
              plannedStartAt: new Date(proposedStage.startsAt),
              plannedEndAt: new Date(proposedStage.endsAt),
              version: 1,
              createdAt: now,
              updatedAt: now,
            });
            initialStageAttempts.push({
              stageRunId,
              stageKind: proposedStage.stage,
              productionOrderIds: proposed.orderIds,
            });
            if (proposedStage.machineIds.length > 0)
              await db.insert(schema.stageMachineAssignments).values(
                proposedStage.machineIds.map((machineId) => ({
                  id: deps.ids.next(),
                  locationId,
                  stageRunId,
                  machineId,
                  plannedStartAt: new Date(proposedStage.startsAt),
                  plannedEndAt: new Date(proposedStage.endsAt),
                  status: 'planned',
                  createdAt: now,
                  updatedAt: now,
                })),
              );
          }
        }

        const initialAttemptValues = initialStageAttempts.flatMap((stage) =>
          stage.productionOrderIds.map((productionOrderId) => ({
            id: deps.ids.next(),
            locationId,
            productionRunId,
            productionOrderId,
            stageRunId: stage.stageRunId,
            stageKind: stage.stageKind,
            attemptNumber: 1,
            status: decision.initialAttemptState,
            assignmentReason: 'initial_schedule',
            assignedAt: now,
            assignedBy: actorId,
            createdAt: now,
            updatedAt: now,
          })),
        );
        if (initialAttemptValues.length > 0)
          await db
            .insert(schema.productionOrderStageAttempts)
            .values(initialAttemptValues);

        const startedResult: StartScheduleResult = {
          scheduleRunId: schedule.scheduleRunId,
          productionRunId,
          productionBatchIds,
          queueVersion: 1,
          startedAt: now.toISOString(),
          replayed: false,
        };
        await appendStartScheduleWorkEvent(db, schema, deps.ids, {
          locationId,
          eventType: 'production_run_started',
          entityType: 'production_run',
          entityId: productionRunId,
          actorId,
          idempotencyKey,
          payload: {
            scheduleRunId: schedule.scheduleRunId,
            productionRunId,
            productionBatchIds,
            queueVersion: 1,
          },
          idempotency: { command: idempotency, result: startedResult },
        });
        return { kind: 'started', result: startedResult };
      },
    }),
  );
  const unit = deps.observeUnitOfWork?.(native) ?? native;
  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unit.transaction(async (repository) => {
        const cell = await work(repository);
        return cell.kind === 'success'
          ? result.ok(cell.value)
          : result.err(cell.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
