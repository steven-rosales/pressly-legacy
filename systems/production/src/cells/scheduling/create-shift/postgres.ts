import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  CreateShiftRepository,
  CreateShiftTransactionRepository,
} from './execute.ts';
import type { StoredCreateShiftWorkEvent } from './idempotency.ts';
import {
  appendCreateShiftWorkEvent,
  findCreateShiftWorkEvent,
} from './work-event.postgres.ts';

export type CreateShiftPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeCreateShiftPostgresRepository = (
  deps: CreateShiftPostgresDependencies,
  schema: ProductionSchema,
): CreateShiftRepository<StoredCreateShiftWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): CreateShiftTransactionRepository<StoredCreateShiftWorkEvent> => ({
      findWorkEvent: (key) => findCreateShiftWorkEvent(db, schema, key),
      saveShift: async (shift) => {
        const [inserted] = await db
          .insert(schema.productionShifts)
          .values({
            id: shift.id,
            locationId: shift.locationId,
            startsAt: new Date(shift.startsAt),
            endsAt: new Date(shift.endsAt),
            timezone: shift.timezone,
            effectiveFolderCount: shift.effectiveFolderCount,
            status: shift.status,
            version: shift.version,
          })
          .returning({ id: schema.productionShifts.id });
        if (inserted === undefined)
          throw invariantViolationError({
            code: 'production_shift_insert_return_missing',
            message: 'Production shift insert failed.',
            safeMessage: 'Production state is inconsistent.',
          });
      },
      appendWorkEvent: (event) =>
        appendCreateShiftWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

  return Object.freeze({
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repository) => {
        const cellOutcome = await work(repository);
        return cellOutcome.kind === 'success'
          ? result.ok(cellOutcome.value)
          : result.err(cellOutcome.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  });
};
