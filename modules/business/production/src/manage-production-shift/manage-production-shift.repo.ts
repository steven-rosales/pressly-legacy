import {
  and,
  eq,
  inArray,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { conflictError, invariantViolationError } from '@pressly/errors';
import type { ManageProductionShiftRepository } from './manage-production-shift.port.ts';
import { asDate, mapShift } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictError({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeManageProductionShiftRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ManageProductionShiftRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),
    lockShift: async (locationId, productionShiftId) => {
      const [row] = await db
        .select()
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
          ),
        )
        .limit(1)
        .for('update');
      return row === undefined ? null : mapShift(row);
    },
    productionRunExists: async (locationId, productionShiftId) => {
      const [row] = await db
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
      return row !== undefined;
    },
    saveShift: async (shift) => {
      const [row] = await db
        .insert(laundryProduction.productionShifts)
        .values({
          id: shift.id,
          locationId: shift.locationId,
          startsAt: asDate(shift.startsAt),
          endsAt: asDate(shift.endsAt),
          timezone: shift.timezone,
          status: shift.status,
          effectiveFolderCount: shift.effectiveFolderCount,
          version: shift.version,
        })
        .returning();
      if (row === undefined)
        throw productionInvariantViolation(
          'production_shift_insert_return_missing',
          'Production shift insert failed.',
        );
      return mapShift(row);
    },
    updateShift: async ({
      locationId,
      productionShiftId,
      startsAt,
      endsAt,
      effectiveFolderCount,
      expectedVersion,
      now,
    }) => {
      const [row] = await db
        .update(laundryProduction.productionShifts)
        .set({
          startsAt: asDate(startsAt),
          endsAt: asDate(endsAt),
          effectiveFolderCount,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionShifts.locationId, locationId),
            eq(laundryProduction.productionShifts.id, productionShiftId),
            eq(laundryProduction.productionShifts.version, expectedVersion),
          ),
        )
        .returning();
      return row === undefined ? null : mapShift(row);
    },
    lockCurrentSchedule: async (locationId, productionShiftId) => {
      const [row] = await db
        .select({
          scheduleRunId: laundryProduction.scheduleRuns.id,
          status: laundryProduction.scheduleRuns.status,
        })
        .from(laundryProduction.scheduleRuns)
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(
              laundryProduction.scheduleRuns.productionShiftId,
              productionShiftId,
            ),
            inArray(laundryProduction.scheduleRuns.status, [
              'draft',
              'accepted',
            ]),
          ),
        )
        .limit(1)
        .for('update');
      return row ?? null;
    },
    supersedeCurrentSchedule: async ({
      locationId,
      scheduleRunId,
      lifecycle,
      now,
    }) => {
      const rows = await db
        .update(laundryProduction.scheduleRuns)
        .set({ status: lifecycle.state, supersededAt: now })
        .where(
          and(
            eq(laundryProduction.scheduleRuns.locationId, locationId),
            eq(laundryProduction.scheduleRuns.id, scheduleRunId),
            eq(laundryProduction.scheduleRuns.status, lifecycle.from),
          ),
        )
        .returning({ id: laundryProduction.scheduleRuns.id });
      if (rows.length !== 1)
        throw productionConcurrencyConflict(
          'production_shift_schedule_version_conflict',
          'Current schedule revision changed unexpectedly.',
        );
      return rows[0]?.id ?? null;
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
