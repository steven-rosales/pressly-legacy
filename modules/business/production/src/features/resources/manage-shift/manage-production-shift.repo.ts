import { invariantViolationError } from '@pressly/errors/factories';
import { and, eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import type { ManageProductionShiftRepository } from './manage-production-shift.port.ts';
import {
  asDate,
  mapShift,
} from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeManageProductionShiftRepository = (deps: {
  db: Database;
  ids: IdSource;
}): ManageProductionShiftRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
