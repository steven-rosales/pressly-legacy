import {
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { ManageProductionShiftRepository } from './manage-production-shift.port.ts';
import { asDate, mapShift } from '../persistence/production-mappers.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';

export const makeManageProductionShiftRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): ManageProductionShiftRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
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
      if (row === undefined) throw new Error('Production shift insert failed.');
      return mapShift(row);
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
