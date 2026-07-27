import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { asDate, mapSchedule } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { scheduleCoversInputExactly } from '../persistence/schedule-snapshot-validation.ts';
import type {
  ScheduleStartRecord,
  StartScheduleRepository,
} from './start-schedule.port.ts';

export const makeStartScheduleRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): StartScheduleRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockShiftForStart: async (locationId, productionShiftId) => {
      const [shift] = await db
        .select({ id: laundryProduction.productionShifts.id })
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
          ),
        )
        .limit(1)
        .for('update');
      return shift !== undefined;
    },

    loadSchedule: async (locationId, scheduleRunId) => {
      const [row] = await db
        .select()
        .from(laundryProduction.scheduleRuns)
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(laundryProduction.scheduleRuns.id, scheduleRunId),
          ),
        )
        .limit(1)
        .for('update');
      if (row === undefined) return null;
      return {
        schedule: mapSchedule(row),
        inputSnapshot:
          row.inputSnapshot as ScheduleStartRecord['inputSnapshot'],
        acceptedBy: row.acceptedBy,
        acknowledgedWarningCodes: row.acknowledgedWarningCodes as string[],
      };
    },

    lockAndLoadStartOrders: async (locationId, record) => {
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
        return null;

      const selectedRows = await db
        .select({
          id: laundryProduction.productionShiftSelectedOrders.productionOrderId,
        })
        .from(laundryProduction.productionShiftSelectedOrders)
        .where(
          and(
            eq(
              laundryProduction.productionShiftSelectedOrders.locationId,
              locationId,
            ),
            eq(
              laundryProduction.productionShiftSelectedOrders.productionShiftId,
              record.schedule.productionShiftId,
            ),
          ),
        )
        .orderBy(
          asc(
            laundryProduction.productionShiftSelectedOrders.productionOrderId,
          ),
        );
      const selectedOrderIds = selectedRows.map((row) => row.id);
      if (
        selectedOrderIds.length === 0 ||
        selectedOrderIds.length !== snapshots.size
      )
        return null;

      const rows = await db
        .select({
          id: laundryProduction.productionOrders.id,
          locationId: laundryProduction.productionOrders.locationId,
          operationalStatus:
            laundryProduction.productionOrders.operationalStatus,
          executionStatus: laundryProduction.productionOrders.executionStatus,
          resolutionState: laundryProduction.productionOrders.resolutionState,
          version: laundryProduction.productionOrders.version,
          derivedWeightLbs: laundryProduction.productionOrders.derivedWeightLbs,
          bagCount: laundryProduction.productionOrders.bagCount,
          priority: laundryProduction.productionOrders.priority,
          dueAt: laundryProduction.productionOrders.dueAt,
        })
        .from(laundryProduction.productionOrders)
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            inArray(laundryProduction.productionOrders.id, selectedOrderIds),
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id))
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

    productionRunExists: async (locationId, productionShiftId) => {
      const [run] = await db
        .select({ id: laundryProduction.productionRuns.id })
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(
              laundryProduction.productionRuns.productionShiftId,
              productionShiftId,
            ),
          ),
        )
        .limit(1);
      return run !== undefined;
    },

    startSchedule: async ({
      locationId,
      record,
      actorId,
      productionRunStatus,
      orderLifecycles,
      initialBatchState,
      initialStageState,
      initialAttemptState,
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
          orderLifecycles.map((order) => [order.productionOrderId, order]),
        );
        if (
          lifecycleByOrderId.size !== selectedOrderIds.length ||
          selectedOrderIds.some((orderId) => !lifecycleByOrderId.has(orderId))
        )
          throw new Error('Order execution decisions are incomplete at Start.');
        for (const orderId of selectedOrderIds) {
          const lifecycle = lifecycleByOrderId.get(orderId)!;
          const [updatedOrder] = await db
            .update(laundryProduction.productionOrders)
            .set({
              operationalStatus: lifecycle.lifecycle.state,
              executionStatus: lifecycle.lifecycle.state,
              pendingPlacement: null,
              version: lifecycle.expectedVersion + 1,
              updatedAt: now,
            })
            .where(
              and(
                eq(laundryProduction.productionOrders.locationId, locationId),
                eq(laundryProduction.productionOrders.id, orderId),
                eq(
                  laundryProduction.productionOrders.operationalStatus,
                  'eligible',
                ),
                eq(
                  laundryProduction.productionOrders.executionStatus,
                  lifecycle.persistedState,
                ),
                eq(laundryProduction.productionOrders.resolutionState, 'open'),
                eq(
                  laundryProduction.productionOrders.version,
                  lifecycle.expectedVersion,
                ),
              ),
            )
            .returning({ id: laundryProduction.productionOrders.id });
          if (updatedOrder === undefined)
            throw new Error('Not every selected order was available at Start.');
        }
      }

      const stationRows = await db
        .select()
        .from(laundryProduction.stations)
        .where(eq(laundryProduction.stations.locationId, locationId));
      const stationByKind = new Map(
        stationRows.map((station) => [station.kind, station.id]),
      );
      const productionRunId = deps.ids.next();
      const acceptsOvertime =
        record.acknowledgedWarningCodes.includes('SHIFT_OVERFLOW');

      await db.insert(laundryProduction.productionRuns).values({
        id: productionRunId,
        locationId,
        productionShiftId: schedule.productionShiftId,
        scheduleRunId: schedule.scheduleRunId,
        status: productionRunStatus,
        startedAt: now,
        queueVersion: 1,
        plannedCompletionAt: asDate(schedule.plannedCompletionAt),
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
        stageKind: (typeof schedule.batches)[number]['stages'][number]['stage'];
        productionOrderIds: readonly string[];
      }[] = [];
      for (const proposed of schedule.batches) {
        const productionBatchId = deps.ids.next();
        productionBatchIds.push(productionBatchId);
        await db.insert(laundryProduction.productionBatches).values({
          id: productionBatchId,
          locationId,
          productionRunId,
          sequenceIndex: proposed.sequence,
          status: initialBatchState,
          pulseCapacityLbs: schedule.pulseCapacityLbs,
          derivedWeightLbs: proposed.derivedWeightLbs,
          pulseMinutes: schedule.pulseMinutes,
          plannedDoneAt: asDate(
            proposed.stages[proposed.stages.length - 1]!.endsAt,
          ),
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(laundryProduction.productionBatchOrders).values(
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
            throw new Error(`Station not found: ${proposedStage.stage}.`);
          const stageRunId = deps.ids.next();
          await db.insert(laundryProduction.stageRuns).values({
            id: stageRunId,
            locationId,
            productionBatchId,
            stationId,
            stageKind: proposedStage.stage,
            status: initialStageState,
            plannedStartAt: asDate(proposedStage.startsAt),
            plannedEndAt: asDate(proposedStage.endsAt),
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
            await db.insert(laundryProduction.stageMachineAssignments).values(
              proposedStage.machineIds.map((machineId) => ({
                id: deps.ids.next(),
                locationId,
                stageRunId,
                machineId,
                plannedStartAt: asDate(proposedStage.startsAt),
                plannedEndAt: asDate(proposedStage.endsAt),
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
          status: initialAttemptState,
          assignmentReason: 'initial_schedule',
          assignedAt: now,
          assignedBy: actorId,
          createdAt: now,
          updatedAt: now,
        })),
      );
      if (initialAttemptValues.length > 0)
        await db
          .insert(laundryProduction.productionOrderStageAttempts)
          .values(initialAttemptValues);

      const startedResult = {
        scheduleRunId: schedule.scheduleRunId,
        productionRunId,
        productionBatchIds,
        queueVersion: 1,
        startedAt: now.toISOString(),
        replayed: false,
      };
      await appendWorkEvent(db, deps.ids, {
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
      return startedResult;
    },
  }));
