import { and, asc, eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import type { ReplaceShiftOrderSelectionRepository } from './replace-shift-order-selection.port.ts';

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeReplaceShiftOrderSelectionRepository = (deps: {
  db: Database;
  ids: IdSource;
}): ReplaceShiftOrderSelectionRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),

    lockSelection: async (locationId, productionShiftId) => {
      const [shift] = await db
        .select({ id: laundryProduction.productionShifts.id })
        .from(laundryProduction.productionShifts)
        .where(
          and(
            eq(laundryProduction.productionShifts.id, productionShiftId),
            eq(laundryProduction.productionShifts.locationId, locationId),
          ),
        )
        .limit(1)
        .for('update');
      if (shift === undefined)
        return {
          state: 'not_found',
          version: 0,
          selectedOrderIds: [],
          currentSchedule: null,
        };

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
      if (run !== undefined)
        return {
          state: 'run_exists',
          version: 0,
          selectedOrderIds: [],
          currentSchedule: null,
        };

      const [selection] = await db
        .select({
          version: laundryProduction.productionShiftSelections.version,
        })
        .from(laundryProduction.productionShiftSelections)
        .where(
          and(
            eq(
              laundryProduction.productionShiftSelections.productionShiftId,
              productionShiftId,
            ),
            eq(
              laundryProduction.productionShiftSelections.locationId,
              locationId,
            ),
          ),
        )
        .limit(1)
        .for('update');
      const selectedOrderIds = await db
        .select({
          id: laundryProduction.productionShiftSelectedOrders.productionOrderId,
        })
        .from(laundryProduction.productionShiftSelectedOrders)
        .where(
          and(
            eq(
              laundryProduction.productionShiftSelectedOrders.productionShiftId,
              productionShiftId,
            ),
            eq(
              laundryProduction.productionShiftSelectedOrders.locationId,
              locationId,
            ),
          ),
        )
        .orderBy(
          asc(
            laundryProduction.productionShiftSelectedOrders.productionOrderId,
          ),
        );
      const [currentSchedule] = await db
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
      return {
        state: 'available',
        version: selection?.version ?? 0,
        selectedOrderIds: selectedOrderIds.map((row) => row.id),
        currentSchedule: currentSchedule ?? null,
      };
    },

    selectedOrdersAreReady: async (locationId, productionOrderIds) => {
      if (productionOrderIds.length === 0) return true;
      const rows = await db
        .select({
          id: laundryProduction.productionOrders.id,
          status: laundryProduction.productionOrders.operationalStatus,
          bagCount: laundryProduction.productionOrders.bagCount,
        })
        .from(laundryProduction.productionOrders)
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            inArray(laundryProduction.productionOrders.id, [
              ...productionOrderIds,
            ]),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        )
        .for('update');
      return (
        rows.length === productionOrderIds.length &&
        rows.every((row) => row.status === 'eligible' && row.bagCount !== null)
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
          .insert(laundryProduction.productionShiftSelections)
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
            version: laundryProduction.productionShiftSelections.version,
          });
        if (created === undefined) return null;
      } else {
        const [updated] = await db
          .update(laundryProduction.productionShiftSelections)
          .set({
            version: nextVersion,
            selectedBy: actorId,
            selectedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(
                laundryProduction.productionShiftSelections.productionShiftId,
                productionShiftId,
              ),
              eq(
                laundryProduction.productionShiftSelections.locationId,
                locationId,
              ),
              eq(
                laundryProduction.productionShiftSelections.version,
                currentVersion,
              ),
            ),
          )
          .returning({
            version: laundryProduction.productionShiftSelections.version,
          });
        if (updated === undefined) return null;
      }

      await db
        .delete(laundryProduction.productionShiftSelectedOrders)
        .where(
          and(
            eq(
              laundryProduction.productionShiftSelectedOrders.productionShiftId,
              productionShiftId,
            ),
            eq(
              laundryProduction.productionShiftSelectedOrders.locationId,
              locationId,
            ),
          ),
        );
      if (selectedOrderIds.length > 0)
        await db.insert(laundryProduction.productionShiftSelectedOrders).values(
          selectedOrderIds.map((productionOrderId) => ({
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
                .update(laundryProduction.scheduleRuns)
                .set({ status: supersede.lifecycle.state, supersededAt: now })
                .where(
                  and(
                    eq(laundryProduction.scheduleRuns.locationId, locationId),
                    eq(
                      laundryProduction.scheduleRuns.id,
                      supersede.scheduleRunId,
                    ),
                    eq(
                      laundryProduction.scheduleRuns.status,
                      supersede.lifecycle.from,
                    ),
                  ),
                )
                .returning({ id: laundryProduction.scheduleRuns.id })
            )[0];
      if (supersede !== null && superseded === undefined)
        throw productionConcurrencyConflict(
          'production_shift_selection_schedule_version_conflict',
          'Current schedule revision changed unexpectedly.',
        );

      return {
        selection: {
          productionShiftId,
          version: nextVersion,
          selectedOrderIds: [...selectedOrderIds],
        },
        supersededScheduleRunId: superseded?.id ?? null,
        replayed: false,
      };
    },

    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
