import type { Database, DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { defineResultUnitOfWork } from '@pressly/db/unit-of-work';
import { invariantViolationError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/kernel';
import {
  appendWorkEvent,
  findWorkEvent,
} from '../../../foundations/adapters/postgres/commands/work-events.adapter.ts';
import { lockLocationScheduling } from '../../../foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import { makeProductionOrderBacklogSnapshotReader } from '../../../foundations/adapters/postgres/production-order-backlog-snapshot/production-order-backlog-snapshot.repo.ts';
import type { ResolveProductionOrderBacklogInput } from './commit-production-order-backlog.model.ts';
import type { CommitProductionOrderBacklogRepository } from './commit-production-order-backlog.port.ts';

const productionInvariantViolation = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Production state is inconsistent.',
  });

export const makeCommitProductionOrderBacklogRepository = (deps: {
  db: Database;
  ids: IdSource;
}): CommitProductionOrderBacklogRepository =>
  defineResultUnitOfWork(deps.db, (db: DatabaseExecutor) => ({
    findWorkEvent: (idempotencyKey: string) =>
      findWorkEvent(db, idempotencyKey),
    lockLocationScheduling: (locationId: string) =>
      lockLocationScheduling(db, locationId),
    loadSnapshotForUpdate: makeProductionOrderBacklogSnapshotReader(
      db,
      'for_update',
    ),
    resolveOrder: async (input: ResolveProductionOrderBacklogInput) => {
      if (input.lifecycle.state !== 'resolved_without_production')
        throw productionInvariantViolation(
          'production_backlog_resolution_transition_invalid',
          'Bulk backlog resolution can only persist the resolve transition.',
        );
      const [changed] = await db
        .update(laundryProduction.productionOrders)
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
            eq(laundryProduction.productionOrders.locationId, input.locationId),
            eq(laundryProduction.productionOrders.id, input.orderId),
            eq(
              laundryProduction.productionOrders.version,
              input.expectedVersion,
            ),
            eq(
              laundryProduction.productionOrders.resolutionState,
              input.lifecycle.from,
            ),
          ),
        )
        .returning({
          orderId: laundryProduction.productionOrders.id,
          resolutionState: laundryProduction.productionOrders.resolutionState,
          version: laundryProduction.productionOrders.version,
        });
      if (changed === undefined) return null;
      if (changed.resolutionState !== 'resolved_without_production')
        throw productionInvariantViolation(
          'production_backlog_persisted_resolution_invalid',
          `Unexpected bulk resolution state: ${changed.resolutionState}.`,
        );
      return {
        orderId: changed.orderId,
        resolutionState: changed.resolutionState,
        version: changed.version,
      } as const;
    },
    appendWorkEvent: (event) => appendWorkEvent(db, deps.ids, event),
  }));
