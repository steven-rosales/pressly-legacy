import {
  and,
  asc,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type {
  AcceptScheduleRepository,
  ScheduleAcceptanceRecord,
} from './accept-schedule.port.ts';
import { mapSchedule } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';
import { scheduleCoversInputExactly } from '../persistence/schedule-snapshot-validation.ts';

export const makeAcceptScheduleRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): AcceptScheduleRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

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

    acceptSchedule: async (
      locationId,
      schedule,
      actorId,
      acknowledgedWarningCodes,
      idempotencyKey,
      idempotency,
      now,
    ) => {
      const [accepted] = await db
        .update(laundryProduction.scheduleRuns)
        .set({
          status: 'accepted',
          acceptedAt: now,
          acceptedBy: actorId,
          acknowledgedWarningCodes: [...acknowledgedWarningCodes].sort(),
        })
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(laundryProduction.scheduleRuns.id, schedule.scheduleRunId),
            eq(laundryProduction.scheduleRuns.status, 'draft'),
          ),
        )
        .returning({
          scheduleRunId: laundryProduction.scheduleRuns.id,
          productionShiftId: laundryProduction.scheduleRuns.productionShiftId,
          acceptedAt: laundryProduction.scheduleRuns.acceptedAt,
        });
      if (accepted === undefined)
        throw new Error('Schedule was already accepted.');

      const acceptedResult = {
        scheduleRunId: accepted.scheduleRunId,
        productionShiftId: accepted.productionShiftId,
        acceptedAt: accepted.acceptedAt!.toISOString(),
        replayed: false,
      };
      await appendWorkEvent(db, deps.ids, {
        locationId,
        eventType: 'schedule_accepted',
        entityType: 'schedule_run',
        entityId: schedule.scheduleRunId,
        actorId,
        idempotencyKey,
        payload: {
          scheduleRunId: schedule.scheduleRunId,
          acknowledgedWarningCodes: [...acknowledgedWarningCodes].sort(),
        },
        idempotency: { command: idempotency, result: acceptedResult },
      });
      return acceptedResult;
    },
  }));
