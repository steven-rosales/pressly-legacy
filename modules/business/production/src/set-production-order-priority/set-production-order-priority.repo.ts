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

export const makeSetProductionOrderPriorityRepository = (deps: {
  db: Database;
  ids: Readonly<{ next: () => string }>;
}): SetProductionOrderPriorityRepository =>
  makePostgresUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
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
