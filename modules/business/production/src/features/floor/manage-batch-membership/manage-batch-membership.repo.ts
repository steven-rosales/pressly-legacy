import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import type { IdSource } from '@pressly/kernel';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import type { ManageBatchMembershipRepository } from './manage-batch-membership.port.ts';

const productionConcurrencyConflict = (code: string, message: string) =>
  conflictFailure({
    code,
    message,
    safeMessage: 'Production state changed. Refresh and try again.',
  });

export const makeManageBatchMembershipRepository = (deps: {
  db: Database;
  ids: IdSource;
}): ManageBatchMembershipRepository =>
  defineUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey) => findWorkEvent(db, idempotencyKey),
    lockBatchMembershipContext: async (
      locationId,
      productionRunId,
      productionBatchId,
    ) => {
      const [productionRun] = await db
        .select({
          id: laundryProduction.productionRuns.id,
          status: laundryProduction.productionRuns.status,
          queueVersion: laundryProduction.productionRuns.queueVersion,
        })
        .from(laundryProduction.productionRuns)
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.id, productionRunId),
          ),
        )
        .limit(1)
        .for('update');
      if (productionRun === undefined) return null;

      const [productionBatch] = await db
        .select({
          id: laundryProduction.productionBatches.id,
          status: laundryProduction.productionBatches.status,
          version: laundryProduction.productionBatches.version,
          membershipFrozenAt:
            laundryProduction.productionBatches.membershipFrozenAt,
          membershipFrozenBy:
            laundryProduction.productionBatches.membershipFrozenBy,
        })
        .from(laundryProduction.productionBatches)
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, productionBatchId),
            eq(
              laundryProduction.productionBatches.productionRunId,
              productionRunId,
            ),
          ),
        )
        .limit(1)
        .for('update');
      if (productionBatch === undefined) return null;

      return { productionRun, productionBatch };
    },
    changeBatchMembership: async ({
      action,
      locationId,
      productionRunId,
      productionBatchId,
      expectedQueueVersion,
      expectedBatchVersion,
      actorId,
      now,
    }) => {
      const [productionBatch] = await db
        .update(laundryProduction.productionBatches)
        .set({
          membershipFrozenAt: action === 'freeze' ? now : null,
          membershipFrozenBy: action === 'freeze' ? actorId : null,
          version: expectedBatchVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionBatches.locationId, locationId),
            eq(laundryProduction.productionBatches.id, productionBatchId),
            eq(
              laundryProduction.productionBatches.productionRunId,
              productionRunId,
            ),
            eq(
              laundryProduction.productionBatches.version,
              expectedBatchVersion,
            ),
            eq(laundryProduction.productionBatches.status, 'queued'),
          ),
        )
        .returning({
          id: laundryProduction.productionBatches.id,
          version: laundryProduction.productionBatches.version,
        });
      if (productionBatch === undefined)
        throw productionConcurrencyConflict(
          'production_batch_membership_batch_version_conflict',
          'Locked production batch changed unexpectedly.',
        );

      const [productionRun] = await db
        .update(laundryProduction.productionRuns)
        .set({
          queueVersion: expectedQueueVersion + 1,
          overtimeProposalHash: null,
          overtimeQueueVersion: null,
          overtimeAcknowledgedBy: null,
          overtimeAcknowledgedAt: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(laundryProduction.productionRuns.locationId, locationId),
            eq(laundryProduction.productionRuns.id, productionRunId),
            eq(laundryProduction.productionRuns.status, 'started'),
            eq(
              laundryProduction.productionRuns.queueVersion,
              expectedQueueVersion,
            ),
          ),
        )
        .returning({
          id: laundryProduction.productionRuns.id,
          queueVersion: laundryProduction.productionRuns.queueVersion,
        });
      if (productionRun === undefined)
        throw productionConcurrencyConflict(
          'production_batch_membership_run_version_conflict',
          'Locked production run changed unexpectedly.',
        );

      return {
        productionRunId: productionRun.id,
        productionBatchId: productionBatch.id,
        queueVersion: productionRun.queueVersion,
        batchVersion: productionBatch.version,
        membership:
          action === 'freeze'
            ? {
                state: 'frozen' as const,
                frozenAt: now.toISOString(),
                frozenBy: actorId,
              }
            : { state: 'mutable' as const },
        replayed: false,
      };
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
