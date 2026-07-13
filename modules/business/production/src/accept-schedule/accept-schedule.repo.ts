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
import type {
  AcceptScheduleRepository,
  ScheduleAcceptanceRecord,
} from './accept-schedule.port.ts';
import { asDate, mapSchedule } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

export const makeAcceptScheduleRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): AcceptScheduleRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),

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
      return row === undefined
        ? null
        : {
            schedule: mapSchedule(row),
            inputSnapshot:
              row.inputSnapshot as ScheduleAcceptanceRecord['inputSnapshot'],
          };
    },

    lockAndValidateSelectedOrders: async (locationId, record) => {
      const selectedOrderIds = record.schedule.batches.flatMap(
        (batch) => batch.orderIds,
      );
      const uniqueOrderIds = [...new Set(selectedOrderIds)].sort();
      if (uniqueOrderIds.length !== selectedOrderIds.length) return false;

      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (
        uniqueOrderIds.some((orderId) => !snapshots.has(orderId)) ||
        snapshots.size !== record.inputSnapshot.orders.length
      )
        return false;
      if (uniqueOrderIds.length === 0) return true;

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
            inArray(laundryProduction.productionOrders.id, uniqueOrderIds),
          ),
        )
        .orderBy(asc(laundryProduction.productionOrders.id))
        .for('update');
      if (rows.length !== uniqueOrderIds.length) return false;

      return rows.every((order) => {
        const snapshot = snapshots.get(order.id);
        return (
          snapshot !== undefined &&
          order.locationId === locationId &&
          order.status === 'eligible' &&
          order.version === snapshot.version &&
          order.derivedWeightLbs === snapshot.derivedWeightLbs &&
          order.bagCount === snapshot.bagCount &&
          order.priority === snapshot.priority &&
          order.dueAt.toISOString() === snapshot.dueAt
        );
      });
    },

    acceptSchedule: async (
      locationId,
      schedule,
      actorId,
      idempotencyKey,
      idempotency,
      now,
    ) => {
      const [shift] = await db
        .select()
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(
              laundryProduction.productionShifts.id,
              schedule.productionShiftId,
            ),
          ),
        )
        .limit(1);
      if (shift === undefined) throw new Error('Production shift not found.');
      const stationRows = await db
        .select()
        .from(laundryProduction.stations)
        .where(eq(laundryProduction.stations.locationId, locationId));
      const stationByKind = new Map(
        stationRows.map((station) => [station.kind, station.id]),
      );
      const selectedOrderIds = [
        ...new Set(schedule.batches.flatMap((batch) => batch.orderIds)),
      ];
      if (
        selectedOrderIds.length !==
        schedule.batches.reduce(
          (count, batch) => count + batch.orderIds.length,
          0,
        )
      )
        throw new Error('Schedule contains duplicate selected orders.');

      if (selectedOrderIds.length > 0) {
        const updatedOrders = await db
          .update(laundryProduction.productionOrders)
          .set({
            status: 'scheduled',
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
        if (
          updatedOrders.length !== selectedOrderIds.length ||
          new Set(updatedOrders.map((order) => order.id)).size !==
            selectedOrderIds.length
        )
          throw new Error('Not every selected production order was scheduled.');
      }

      const productionRunId = deps.ids.next();
      await db.insert(laundryProduction.productionRuns).values({
        id: productionRunId,
        locationId,
        productionShiftId: schedule.productionShiftId,
        scheduleRunId: schedule.scheduleRunId,
        status: 'planned',
        version: 1,
        createdAt: now,
        updatedAt: now,
      });

      const productionBatchIds: string[] = [];
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

      const [accepted] = await db
        .update(laundryProduction.scheduleRuns)
        .set({ status: 'accepted', acceptedAt: now })
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(laundryProduction.scheduleRuns.id, schedule.scheduleRunId),
            eq(laundryProduction.scheduleRuns.status, 'draft'),
          ),
        )
        .returning({ id: laundryProduction.scheduleRuns.id });
      if (accepted === undefined)
        throw new Error('Schedule was already accepted.');

      const acceptedResult = {
        productionRunId,
        productionBatchIds,
        replayed: false,
      };
      await appendWorkEvent(db, deps.ids, {
        locationId,
        eventType: 'schedule_accepted',
        entityType: 'production_run',
        entityId: productionRunId,
        actorId,
        idempotencyKey,
        payload: { productionRunId, productionBatchIds },
        idempotency: { command: idempotency, result: acceptedResult },
      });
      return acceptedResult;
    },
  }));
