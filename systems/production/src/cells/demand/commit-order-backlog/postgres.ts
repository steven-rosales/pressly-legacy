import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';
import { makeProductionOrderBacklogSnapshotReader } from '../../../read-models/production-order-backlog/postgres.ts';
import type {
  CommitOrderBacklogRepository,
  CommitOrderBacklogTransactionRepository,
} from './execute.ts';
import type { StoredCommitOrderBacklogWorkEvent } from './idempotency.ts';
import type { ResolveCommitOrderBacklogInput } from './types.ts';
import {
  appendCommitOrderBacklogWorkEvent,
  findCommitOrderBacklogWorkEvent,
} from './work-event.postgres.ts';

const invariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

const lockLocationScheduling = async (
  database: PostgresExecutor,
  locationId: string,
): Promise<void> => {
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtext('production-scheduling'), hashtext(${locationId}))`,
  );
};

const resolveOrder = async (
  database: PostgresExecutor,
  input: ResolveCommitOrderBacklogInput,
  schema: ProductionSchema,
) => {
  if (input.lifecycle.state !== 'resolved_without_production')
    throw invariant(
      'production_backlog_resolution_transition_invalid',
      'Bulk backlog resolution can only persist the resolve transition.',
    );
  const [changed] = await database
    .update(schema.productionOrders)
    .set({
      resolutionState: input.lifecycle.state,
      resolvedAt: input.now,
      resolvedBy: input.actorId,
      resolutionReason: input.reason,
      resolutionNote: input.note,
      resolutionBulkOperationId: input.bulkOperationId,
      version: input.expectedVersion + 1,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.productionOrders.locationId, input.locationId),
        eq(schema.productionOrders.id, input.orderId),
        eq(schema.productionOrders.version, input.expectedVersion),
        eq(schema.productionOrders.resolutionState, input.lifecycle.from),
      ),
    )
    .returning({
      orderId: schema.productionOrders.id,
      resolutionState: schema.productionOrders.resolutionState,
      version: schema.productionOrders.version,
    });
  if (changed === undefined) return null;
  if (changed.resolutionState !== 'resolved_without_production')
    throw invariant(
      'production_backlog_persisted_resolution_invalid',
      `Unexpected bulk resolution state: ${changed.resolutionState}.`,
    );
  return {
    orderId: changed.orderId,
    resolutionState: changed.resolutionState,
    version: changed.version,
  } as const;
};

export type CommitOrderBacklogPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeCommitOrderBacklogPostgresRepository = (
  dependencies: CommitOrderBacklogPostgresDependencies,
  schema: ProductionSchema,
): CommitOrderBacklogRepository<StoredCommitOrderBacklogWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    dependencies.db,
    (
      database: PostgresExecutor,
    ): CommitOrderBacklogTransactionRepository<StoredCommitOrderBacklogWorkEvent> => ({
      findWorkEvent: (key) =>
        findCommitOrderBacklogWorkEvent(database, schema, key),
      lockLocationScheduling: (locationId) =>
        lockLocationScheduling(database, locationId),
      loadSnapshotForUpdate: makeProductionOrderBacklogSnapshotReader(
        database,
        schema,
        'for_update',
      ),
      resolveOrder: (input) => resolveOrder(database, input, schema),
      appendWorkEvent: (event) =>
        appendCommitOrderBacklogWorkEvent(
          database,
          schema,
          dependencies.ids,
          event,
        ),
    }),
  );
  const unitOfWork =
    dependencies.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;

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
