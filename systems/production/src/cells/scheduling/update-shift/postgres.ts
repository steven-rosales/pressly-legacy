import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  UpdateShiftRepository,
  UpdateShiftTransactionRepository,
} from './execute.ts';
import type { StoredUpdateShiftWorkEvent } from './idempotency.ts';
import type { ProductionShift, ProductionShiftStatus } from './types.ts';
import {
  appendUpdateShiftWorkEvent,
  findUpdateShiftWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const shiftStatus = (value: string): ProductionShiftStatus => {
  if (value === 'closed' || value === 'draft' || value === 'open') return value;
  throw invariant(
    'production_shift_status_invalid',
    `Unknown production-shift status: ${value}.`,
  );
};

const mapShift = (
  row: ProductionSchema['productionShifts']['$inferSelect'],
): ProductionShift => ({
  id: row.id,
  locationId: row.locationId,
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt.toISOString(),
  timezone: row.timezone,
  effectiveFolderCount: row.effectiveFolderCount,
  status: shiftStatus(row.status),
  version: row.version,
});

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

export type UpdateShiftPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeUpdateShiftPostgresRepository = (
  deps: UpdateShiftPostgresDependencies,
  schema: ProductionSchema,
): UpdateShiftRepository<StoredUpdateShiftWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): UpdateShiftTransactionRepository<StoredUpdateShiftWorkEvent> => ({
      findWorkEvent: (key) => findUpdateShiftWorkEvent(db, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockShift: async (locationId, productionShiftId) => {
        const [row] = await db
          .select()
          .from(schema.productionShifts)
          .where(
            and(
              eq(schema.productionShifts.locationId, locationId),
              eq(schema.productionShifts.id, productionShiftId),
            ),
          )
          .limit(1)
          .for('update');
        return row === undefined ? null : mapShift(row);
      },
      productionRunExists: async (locationId, productionShiftId) => {
        const [row] = await db
          .select({ id: schema.productionRuns.id })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.productionShiftId, productionShiftId),
            ),
          )
          .limit(1);
        return row !== undefined;
      },
      updateShift: async ({ command, now }) => {
        const [row] = await db
          .update(schema.productionShifts)
          .set({
            startsAt: new Date(command.startsAt),
            endsAt: new Date(command.endsAt),
            effectiveFolderCount: command.effectiveFolderCount,
            version: command.expectedVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionShifts.locationId, command.locationId),
              eq(schema.productionShifts.id, command.productionShiftId),
              eq(schema.productionShifts.version, command.expectedVersion),
            ),
          )
          .returning();
        return row === undefined ? null : mapShift(row);
      },
      lockCurrentSchedule: async (locationId, productionShiftId) => {
        const [row] = await db
          .select({
            scheduleRunId: schema.scheduleRuns.id,
            status: schema.scheduleRuns.status,
          })
          .from(schema.scheduleRuns)
          .where(
            and(
              eq(schema.scheduleRuns.locationId, locationId),
              eq(schema.scheduleRuns.productionShiftId, productionShiftId),
              inArray(schema.scheduleRuns.status, ['draft', 'accepted']),
            ),
          )
          .limit(1)
          .for('update');
        return row ?? null;
      },
      supersedeCurrentSchedule: async ({ locationId, supersession, now }) => {
        const rows = await db
          .update(schema.scheduleRuns)
          .set({
            status: supersession.lifecycle.state,
            supersededAt: now,
          })
          .where(
            and(
              eq(schema.scheduleRuns.locationId, locationId),
              eq(schema.scheduleRuns.id, supersession.scheduleRunId),
              eq(schema.scheduleRuns.status, supersession.lifecycle.from),
            ),
          )
          .returning({ id: schema.scheduleRuns.id });
        return rows.length === 1 && rows[0] !== undefined
          ? { kind: 'superseded', scheduleRunId: rows[0].id }
          : { kind: 'conflict' };
      },
      appendWorkEvent: (event) =>
        appendUpdateShiftWorkEvent(db, schema, deps.ids, event),
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
