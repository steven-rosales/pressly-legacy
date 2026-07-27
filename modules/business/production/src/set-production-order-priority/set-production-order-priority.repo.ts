import {
  and,
  eq,
  laundryProduction,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import type { SetProductionOrderPriorityRepository } from './set-production-order-priority.port.ts';
import { makePostgresUnitOfWork } from '../persistence/postgres-unit-of-work.ts';
import { appendWorkEvent, findWorkEvent } from '../persistence/work-events.ts';
import { lockLocationScheduling } from '../persistence/scheduling-locks.ts';

export const makeSetProductionOrderPriorityRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): SetProductionOrderPriorityRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId) =>
      lockLocationScheduling(db, locationId),
    lockPriorityOrder: async (locationId, productionOrderId) => {
      const [order] = await db
        .select({
          version: laundryProduction.productionOrders.version,
          resolutionState: laundryProduction.productionOrders.resolutionState,
        })
        .from(laundryProduction.productionOrders)
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, productionOrderId),
          ),
        )
        .limit(1)
        .for('update');
      return order ?? null;
    },
    setOrderPriority: async ({
      locationId,
      productionOrderId,
      priority,
      expectedVersion,
      now,
    }) => {
      const [updated] = await db
        .update(laundryProduction.productionOrders)
        .set({ priority, version: expectedVersion + 1, updatedAt: now })
        .where(
          and(
            eq(laundryProduction.productionOrders.locationId, locationId),
            eq(laundryProduction.productionOrders.id, productionOrderId),
            eq(laundryProduction.productionOrders.version, expectedVersion),
            eq(laundryProduction.productionOrders.resolutionState, 'open'),
          ),
        )
        .returning({
          id: laundryProduction.productionOrders.id,
          version: laundryProduction.productionOrders.version,
        });
      return updated === undefined
        ? null
        : { entityId: updated.id, version: updated.version, replayed: false };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
