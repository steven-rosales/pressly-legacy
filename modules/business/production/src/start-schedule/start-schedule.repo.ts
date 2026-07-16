import {
  and,
  asc,
  eq,
  inArray,
  laundryProduction,
  sql,
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

    lockAndValidateScheduleInput: async (locationId, record) => {
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
        return false;

      const rows = await db
        .select({
          id: laundryProduction.productionOrders.id,
          locationId: laundryProduction.productionOrders.locationId,
          status: laundryProduction.productionOrders.status,
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
            eq(laundryProduction.productionOrders.status, 'eligible'),
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id))
        .for('update');
      if (rows.length !== snapshots.size) return false;

      return rows.every((order) => {
        const snapshot = snapshots.get(order.id);
        return (
          snapshot !== undefined &&
          order.version === snapshot.version &&
          order.derivedWeightLbs === snapshot.derivedWeightLbs &&
          order.bagCount === snapshot.bagCount &&
          order.priority === snapshot.priority &&
          order.dueAt.toISOString() === snapshot.dueAt
        );
      });
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
      idempotencyKey,
      idempotency,
      now,
    }) => {
      const schedule = record.schedule;
      const selectedOrderIds = schedule.batches.flatMap(
        (batch) => batch.orderIds,
      );
      if (selectedOrderIds.length > 0) {
        const updatedOrders = await db
          .update(laundryProduction.productionOrders)
          .set({
            status: 'scheduled',
            pendingPlacement: null,
            version: sql`${laundryProduction.productionOrders.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(laundryProduction.productionOrders.locationId, locationId),
              eq(laundryProduction.productionOrders.status, 'eligible'),
              inArray(laundryProduction.productionOrders.id, selectedOrderIds),
            ),
          )
          .returning({ id: laundryProduction.productionOrders.id });
        if (updatedOrders.length !== selectedOrderIds.length)
          throw new Error('Not every selected order was available at Start.');
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
        status: 'started',
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
          status: 'queued',
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
            status: 'planned',
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
          status: 'assigned',
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
