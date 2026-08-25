import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, asc, eq, inArray, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import type {
  ReplaceShiftSelectionRepository,
  ReplaceShiftSelectionTransactionRepository,
} from './execute.ts';
import type { StoredReplaceShiftSelectionWorkEvent } from './idempotency.ts';
import {
  appendReplaceShiftSelectionWorkEvent,
  findReplaceShiftSelectionWorkEvent,
} from './work-event.postgres.ts';

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

export type ReplaceShiftSelectionPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeReplaceShiftSelectionPostgresRepository = (
  deps: ReplaceShiftSelectionPostgresDependencies,
  schema: ProductionSchema,
): ReplaceShiftSelectionRepository<StoredReplaceShiftSelectionWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): ReplaceShiftSelectionTransactionRepository<StoredReplaceShiftSelectionWorkEvent> => ({
      findWorkEvent: (idempotencyKey) =>
        findReplaceShiftSelectionWorkEvent(db, schema, idempotencyKey),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockSelection: async (locationId, productionShiftId) => {
        const [shift] = await db
          .select({ id: schema.productionShifts.id })
          .from(schema.productionShifts)
          .where(
            and(
              eq(schema.productionShifts.id, productionShiftId),
              eq(schema.productionShifts.locationId, locationId),
            ),
          )
          .limit(1)
          .for('update');
        if (shift === undefined) return { state: 'not_found' };

        const [run] = await db
          .select({ id: schema.productionRuns.id })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.productionShiftId, productionShiftId),
            ),
          )
          .limit(1);
        if (run !== undefined) return { state: 'run_exists' };

        const [selection] = await db
          .select({
            version: schema.productionShiftSelections.version,
          })
          .from(schema.productionShiftSelections)
          .where(
            and(
              eq(
                schema.productionShiftSelections.productionShiftId,
                productionShiftId,
              ),
              eq(schema.productionShiftSelections.locationId, locationId),
            ),
          )
          .limit(1)
          .for('update');

        const [currentSchedule] = await db
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

        const selectedOrderIds = await db
          .select({
            id: schema.productionShiftSelectedOrders.productionOrderId,
          })
          .from(schema.productionShiftSelectedOrders)
          .where(
            and(
              eq(
                schema.productionShiftSelectedOrders.productionShiftId,
                productionShiftId,
              ),
              eq(schema.productionShiftSelectedOrders.locationId, locationId),
            ),
          )
          .orderBy(asc(schema.productionShiftSelectedOrders.productionOrderId));

        return {
          state: 'available',
          version: selection?.version ?? 0,
          selectedOrderIds: selectedOrderIds.map((row) => row.id),
          currentSchedule: currentSchedule ?? null,
        };
      },
      selectedOrdersAreReady: async (locationId, productionOrderIds) => {
        if (productionOrderIds.length === 0) return true;
        const orderedIds = [...productionOrderIds].sort((left, right) =>
          left.localeCompare(right),
        );
        const rows = await db
          .select({
            id: schema.productionOrders.id,
            status: schema.productionOrders.operationalStatus,
            bagCount: schema.productionOrders.bagCount,
          })
          .from(schema.productionOrders)
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              inArray(schema.productionOrders.id, orderedIds),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          )
          .orderBy(asc(schema.productionOrders.id))
          .for('update');
        return (
          rows.length === orderedIds.length &&
          rows.every(
            (row) => row.status === 'eligible' && row.bagCount !== null,
          )
        );
      },
      replaceSelection: async ({
        locationId,
        productionShiftId,
        selectedOrderIds,
        currentVersion,
        supersede,
        actorId,
        now,
      }) => {
        const nextVersion = currentVersion + 1;
        if (currentVersion === 0) {
          const [created] = await db
            .insert(schema.productionShiftSelections)
            .values({
              productionShiftId,
              locationId,
              version: nextVersion,
              selectedBy: actorId,
              selectedAt: now,
              updatedAt: now,
            })
            .onConflictDoNothing()
            .returning({
              version: schema.productionShiftSelections.version,
            });
          if (created === undefined) return { kind: 'selection_conflict' };
        } else {
          const [updated] = await db
            .update(schema.productionShiftSelections)
            .set({
              version: nextVersion,
              selectedBy: actorId,
              selectedAt: now,
              updatedAt: now,
            })
            .where(
              and(
                eq(
                  schema.productionShiftSelections.productionShiftId,
                  productionShiftId,
                ),
                eq(schema.productionShiftSelections.locationId, locationId),
                eq(schema.productionShiftSelections.version, currentVersion),
              ),
            )
            .returning({
              version: schema.productionShiftSelections.version,
            });
          if (updated === undefined) return { kind: 'selection_conflict' };
        }

        await db
          .delete(schema.productionShiftSelectedOrders)
          .where(
            and(
              eq(
                schema.productionShiftSelectedOrders.productionShiftId,
                productionShiftId,
              ),
              eq(schema.productionShiftSelectedOrders.locationId, locationId),
            ),
          );
        const orderedIds = [...selectedOrderIds].sort((left, right) =>
          left.localeCompare(right),
        );
        if (orderedIds.length > 0)
          await db.insert(schema.productionShiftSelectedOrders).values(
            orderedIds.map((productionOrderId) => ({
              productionShiftId,
              locationId,
              productionOrderId,
              selectedBy: actorId,
              selectedAt: now,
            })),
          );

        const superseded =
          supersede === null
            ? undefined
            : (
                await db
                  .update(schema.scheduleRuns)
                  .set({ status: supersede.lifecycle.state, supersededAt: now })
                  .where(
                    and(
                      eq(schema.scheduleRuns.locationId, locationId),
                      eq(schema.scheduleRuns.id, supersede.scheduleRunId),
                      eq(schema.scheduleRuns.status, supersede.lifecycle.from),
                    ),
                  )
                  .returning({ id: schema.scheduleRuns.id })
              )[0];
        if (supersede !== null && superseded === undefined)
          return { kind: 'schedule_conflict' };

        return {
          kind: 'saved',
          result: {
            selection: {
              productionShiftId,
              version: nextVersion,
              selectedOrderIds: orderedIds,
            },
            supersededScheduleRunId: superseded?.id ?? null,
            replayed: false,
          },
        };
      },
      appendWorkEvent: (event) =>
        appendReplaceShiftSelectionWorkEvent(db, schema, deps.ids, event),
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
