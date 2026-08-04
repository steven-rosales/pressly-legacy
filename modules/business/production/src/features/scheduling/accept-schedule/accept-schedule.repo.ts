import { and, asc, eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { AcceptScheduleRepository } from './accept-schedule.port.ts';
import { mapSchedule } from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';
import { readSchedulingInput } from '../../../foundations/adapters/postgres/scheduling/production-schedule-json.persistence.mapper.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import { scheduleCoversInputExactly } from '../../../foundations/language/scheduling/schedule-snapshot-validation.policy.ts';

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeAcceptScheduleRepository = (deps: {
  db: Database;
  ids: IdSource;
}): AcceptScheduleRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
            inputSnapshot: readSchedulingInput(row.inputSnapshot),
          };
    },

    lockAndValidateScheduleInput: async (locationId, record) => {
      const snapshots = new Map(
        record.inputSnapshot.orders.map((order) => [order.id, order]),
      );
      if (!scheduleCoversInputExactly(record.schedule, record.inputSnapshot))
        return false;

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
        return false;

      const rows = await db
        .select({
          id: laundryProduction.productionOrders.id,
          locationId: laundryProduction.productionOrders.locationId,
          status: laundryProduction.productionOrders.operationalStatus,
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
      lifecycle,
      now,
    ) => {
      const [accepted] = await db
        .update(laundryProduction.scheduleRuns)
        .set({
          status: lifecycle.state,
          acceptedAt: now,
          acceptedBy: actorId,
          acknowledgedWarningCodes: [...acknowledgedWarningCodes].sort(),
        })
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(laundryProduction.scheduleRuns.id, schedule.scheduleRunId),
            eq(laundryProduction.scheduleRuns.status, lifecycle.from),
          ),
        )
        .returning({
          scheduleRunId: laundryProduction.scheduleRuns.id,
          productionShiftId: laundryProduction.scheduleRuns.productionShiftId,
          acceptedAt: laundryProduction.scheduleRuns.acceptedAt,
        });
      if (accepted === undefined)
        throw productionConcurrencyConflict(
          'production_schedule_already_accepted',
          'Schedule was already accepted.',
        );

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
