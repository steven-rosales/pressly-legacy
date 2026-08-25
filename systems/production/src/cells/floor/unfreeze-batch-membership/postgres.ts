import type {
  PostgresDatabase,
  PostgresExecutor,
} from '@pressly/postgres/client';
import { and, eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import { defineResultUnitOfWork } from '@pressly/postgres/unit-of-work';
import * as result from '@pressly/cells/result';
import type { IdSource } from '@pressly/cells/id-source';
import type {
  UnfreezeBatchMembershipRepository,
  UnfreezeBatchMembershipTransactionRepository,
} from './execute.ts';
import type { StoredUnfreezeBatchMembershipWorkEvent } from './idempotency.ts';
import type { UnfreezeBatchMembershipExpectedFailure } from './types.ts';
import {
  appendUnfreezeBatchMembershipWorkEvent,
  findUnfreezeBatchMembershipWorkEvent,
} from './work-event.postgres.ts';
import type { ProductionResultUnitOfWorkObserver } from '../../../postgres/result-unit-of-work-observer.ts';

const concurrencyFailure = (
  code: string,
  message: string,
): UnfreezeBatchMembershipExpectedFailure => ({
  kind: 'conflict',
  code,
  message,
  safeMessage: 'Production state changed. Refresh and try again.',
});

export type UnfreezeBatchMembershipPostgresDependencies = Readonly<{
  db: PostgresDatabase;
  ids: IdSource;
  observeUnitOfWork?: ProductionResultUnitOfWorkObserver;
}>;

export const makeUnfreezeBatchMembershipPostgresRepository = (
  deps: UnfreezeBatchMembershipPostgresDependencies,
  schema: ProductionSchema,
): UnfreezeBatchMembershipRepository<StoredUnfreezeBatchMembershipWorkEvent> => {
  const nativeUnitOfWork = defineResultUnitOfWork(
    deps.db,
    (
      db: PostgresExecutor,
    ): UnfreezeBatchMembershipTransactionRepository<StoredUnfreezeBatchMembershipWorkEvent> => ({
      findWorkEvent: (key) =>
        findUnfreezeBatchMembershipWorkEvent(db, schema, key),
      lockBatchMembershipContext: async (
        locationId,
        productionRunId,
        productionBatchId,
      ) => {
        const [productionRun] = await db
          .select({
            id: schema.productionRuns.id,
            status: schema.productionRuns.status,
            queueVersion: schema.productionRuns.queueVersion,
          })
          .from(schema.productionRuns)
          .where(
            and(
              eq(schema.productionRuns.locationId, locationId),
              eq(schema.productionRuns.id, productionRunId),
            ),
          )
          .limit(1)
          .for('update');
        if (productionRun === undefined) return null;
        const [productionBatch] = await db
          .select({
            id: schema.productionBatches.id,
            status: schema.productionBatches.status,
            version: schema.productionBatches.version,
            membershipFrozenAt: schema.productionBatches.membershipFrozenAt,
            membershipFrozenBy: schema.productionBatches.membershipFrozenBy,
          })
          .from(schema.productionBatches)
          .where(
            and(
              eq(schema.productionBatches.locationId, locationId),
              eq(schema.productionBatches.id, productionBatchId),
              eq(schema.productionBatches.productionRunId, productionRunId),
            ),
          )
          .limit(1)
          .for('update');
        return productionBatch === undefined
          ? null
          : { productionRun, productionBatch };
      },
      unfreezeBatchMembership: async ({ command, now }) => {
        const [batch] = await db
          .update(schema.productionBatches)
          .set({
            membershipFrozenAt: null,
            membershipFrozenBy: null,
            version: command.expectedBatchVersion + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionBatches.locationId, command.locationId),
              eq(schema.productionBatches.id, command.productionBatchId),
              eq(
                schema.productionBatches.productionRunId,
                command.productionRunId,
              ),
              eq(
                schema.productionBatches.version,
                command.expectedBatchVersion,
              ),
              eq(schema.productionBatches.status, 'queued'),
            ),
          )
          .returning({
            id: schema.productionBatches.id,
            version: schema.productionBatches.version,
          });
        if (batch === undefined)
          return {
            kind: 'failure',
            failure: concurrencyFailure(
              'production_batch_membership_batch_version_conflict',
              'Locked production batch changed unexpectedly.',
            ),
          };
        const [run] = await db
          .update(schema.productionRuns)
          .set({
            queueVersion: command.expectedQueueVersion + 1,
            overtimeProposalHash: null,
            overtimeQueueVersion: null,
            overtimeAcknowledgedBy: null,
            overtimeAcknowledgedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.productionRuns.locationId, command.locationId),
              eq(schema.productionRuns.id, command.productionRunId),
              eq(schema.productionRuns.status, 'started'),
              eq(
                schema.productionRuns.queueVersion,
                command.expectedQueueVersion,
              ),
            ),
          )
          .returning({
            id: schema.productionRuns.id,
            queueVersion: schema.productionRuns.queueVersion,
          });
        if (run === undefined)
          return {
            kind: 'failure',
            failure: concurrencyFailure(
              'production_batch_membership_run_version_conflict',
              'Locked production run changed unexpectedly.',
            ),
          };
        return {
          kind: 'success',
          value: {
            productionRunId: run.id,
            productionBatchId: batch.id,
            queueVersion: run.queueVersion,
            batchVersion: batch.version,
            membership: { state: 'mutable' },
            replayed: false,
          },
        };
      },
      appendWorkEvent: (event) =>
        appendUnfreezeBatchMembershipWorkEvent(db, schema, deps.ids, event),
    }),
  );
  const unitOfWork =
    deps.observeUnitOfWork?.(nativeUnitOfWork) ?? nativeUnitOfWork;
  return {
    transaction: async (work) => {
      const outcome = await unitOfWork.transaction(async (repo) => {
        const cell = await work(repo);
        return cell.kind === 'success'
          ? result.ok(cell.value)
          : result.err(cell.failure);
      });
      return outcome.tag === 'ok'
        ? { kind: 'success', value: outcome.value }
        : { kind: 'failure', failure: outcome.error };
    },
  };
};
