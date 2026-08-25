import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  SetOrderPriorityRepository,
  SetOrderPriorityTransactionRepository,
} from './execute.ts';
import type { StoredSetOrderPriorityWorkEvent } from './idempotency.ts';
import {
  appendSetOrderPriorityWorkEvent,
  findSetOrderPriorityWorkEvent,
} from './work-event.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';

const lockLocationScheduling = async (
  db: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

export type SetOrderPriorityPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeSetOrderPriorityPostgresRepository = (
  deps: SetOrderPriorityPostgresDependencies,
  schema: ProductionSchema,
): SetOrderPriorityRepository<StoredSetOrderPriorityWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): SetOrderPriorityTransactionRepository<StoredSetOrderPriorityWorkEvent> => ({
      findWorkEvent: (idempotencyKey) =>
        findSetOrderPriorityWorkEvent(db, schema, idempotencyKey),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(db, locationId),
      lockPriorityOrder: async (locationId, productionOrderId) => {
        const [order] = await db
          .select({
            productionOrderId: schema.productionOrders.id,
            version: schema.productionOrders.version,
            resolutionState: schema.productionOrders.resolutionState,
          })
          .from(schema.productionOrders)
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              eq(schema.productionOrders.id, productionOrderId),
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
          .update(schema.productionOrders)
          .set({
            priority,
            version: expectedVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionOrders.locationId, locationId),
              eq(schema.productionOrders.id, productionOrderId),
              eq(schema.productionOrders.version, expectedVersion),
              eq(schema.productionOrders.resolutionState, 'open'),
            ),
          )
          .returning({
            entityId: schema.productionOrders.id,
            version: schema.productionOrders.version,
          });
        return updated === undefined
          ? null
          : { ...updated, replayed: false as const };
      },
      appendWorkEvent: (event) =>
        appendSetOrderPriorityWorkEvent(db, schema, deps.ids, event),
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
