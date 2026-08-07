import type { Database, DatabaseExecutor } from '@pressly/db/client';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/kernel';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import {
  asDate,
  mapShift,
} from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';
import type { CreateProductionShiftRepository } from './create-production-shift.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const makeCreateProductionShiftRepository = (deps: {
  db: Database;
  ids: IdSource;
}): CreateProductionShiftRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
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
      if (row === undefined)
        throw productionInvariantViolation(
          'production_shift_insert_return_missing',
          'Production shift insert failed.',
        );
      return mapShift(row);
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
