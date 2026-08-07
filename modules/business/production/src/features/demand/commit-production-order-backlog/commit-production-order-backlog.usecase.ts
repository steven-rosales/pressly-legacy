import { sha256Text } from '@pressly/codec/node';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import type { WorkEventCommandIdentity } from '../../../foundations/language/commands/production-command.model.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { ProductionOrderResolutionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import {
  conflictFailure,
  isProductionFeatureFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import type { ProductionOrderBacklogCursorFailure } from '../../../foundations/language/production-order-backlog/production-order-backlog.failure.ts';
import type {
  ClassifiedProductionOrderBacklogOrder,
  ClassifiedProductionOrderBacklogSnapshot,
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogSnapshotScope,
} from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';
import {
  classifyProductionOrderBacklogSnapshot,
  hashProductionOrderBacklogPreview,
} from '../../../foundations/language/production-order-backlog/production-order-backlog.projection.ts';
import type { ProductionOrderResolutionPolicy } from '../../../foundations/language/resolution/production-order-resolution.policy.ts';
import type { ProductionOrderBacklogCursorCodec } from '../../../foundations/ports/production-order-backlog-cursor/production-order-backlog-cursor.port.ts';
import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
} from './commit-production-order-backlog.model.ts';
import type {
  CommitProductionOrderBacklog,
  CommitProductionOrderBacklogRepository,
} from './commit-production-order-backlog.port.ts';

const snapshotScope = (
  command: CommitProductionOrderBacklogCommand,
  cursor: ProductionOrderBacklogCursorCodec,
): Result<
  ProductionOrderBacklogSnapshotScope,
  ProductionOrderBacklogCursorFailure
> => {
  const after = cursor.decode(command.cursor, command);
  if (after.tag === 'err') return after;

  return result.ok({
    locationId: command.locationId,
    filter: command.filter,
    cutoff: new Date(command.cutoff),
    maxOrders: command.maxOrders,
    after: after.value,
  });
};

const backlogCursorError = (failure: ProductionOrderBacklogCursorFailure) =>
  validationFailure({
    code: 'production_order_backlog_cursor_invalid',
    message: failure.message,
    safeMessage: failure.message,
    details: { reason: failure.code },
  });

const nextCursorFor = (
  command: CommitProductionOrderBacklogCommand,
  classified: ClassifiedProductionOrderBacklogSnapshot,
  cursor: ProductionOrderBacklogCursorCodec,
): ProductionOrderBacklogCursor | null => {
  const lastOrder = classified.orders.at(-1)?.snapshot;
  return classified.hasMore && lastOrder !== undefined
    ? cursor.encode(command, lastOrder)
    : null;
};

const perOrderIdempotencyKey = (commandKey: string, orderId: string): string =>
  `bulk-order:${sha256Text(`${commandKey}\0${orderId}`)}`;

const perOrderCommandIdentity = (input: {
  command: CommitProductionOrderBacklogCommand;
  orderId: string;
  expectedVersion: number;
  bulkOperationId: string;
}): WorkEventCommandIdentity =>
  defineWorkEventCommand({
    operation: 'production_order_bulk_resolved_without_production',
    locationId: input.command.locationId,
    actorId: input.command.actorId,
    entityType: 'production_order',
    entityId: input.orderId,
    expectedVersion: input.expectedVersion,
    payload: {
      bulkOperationId: input.bulkOperationId,
      previewHash: input.command.previewHash,
      reason: input.command.reason,
    },
  });

export const makeCommitProductionOrderBacklog = (deps: {
  repo: CommitProductionOrderBacklogRepository;
  policy: ProductionOrderResolutionPolicy;
  cursor: ProductionOrderBacklogCursorCodec;
  clock: Clock;
  ids: IdSource;
}): CommitProductionOrderBacklog =>
  async function commitProductionOrderBacklog(command) {
    const scope = snapshotScope(command, deps.cursor);
    if (scope.tag === 'err') return result.err(backlogCursorError(scope.error));

    const idempotency = defineWorkEventCommand({
      operation: 'production_order_backlog_bulk_resolution',
      locationId: command.locationId,
      actorId: command.actorId,
      entityType: 'production_order_bulk_resolution',
      expectedVersion: null,
      payload: {
        filter: command.filter,
        cutoff: command.cutoff,
        reason: command.reason,
        note: command.note,
        maxOrders: command.maxOrders,
        cursor: command.cursor,
        previewHash: command.previewHash,
      },
    });

    try {
      return await deps.repo.transaction(async (repo) => {
        const replay =
          resolveWorkEventReplay<ProductionOrderBacklogCommitResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock =
          resolveWorkEventReplay<ProductionOrderBacklogCommitResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);

        const snapshot = await repo.loadSnapshotForUpdate(scope.value);
        const classified = classifyProductionOrderBacklogSnapshot(
          deps.policy,
          snapshot,
        );
        const actualHash = hashProductionOrderBacklogPreview(
          command,
          classified,
        );
        if (actualHash !== command.previewHash)
          return result.err(
            conflictFailure({
              code: 'production_order_backlog_preview_stale',
              message:
                'The old-order backlog changed after it was reviewed. Refresh the preview before committing.',
              safeMessage:
                'The old-order backlog changed after it was reviewed. Refresh the preview before committing.',
            }),
          );

        const ready = classified.orders.filter(
          (
            order,
          ): order is ClassifiedProductionOrderBacklogOrder & {
            lifecycle: ProductionOrderResolutionLifecycleDecision;
          } =>
            order.item.category === 'ready_to_archive' &&
            order.lifecycle !== null,
        );
        const bulkOperationId = deps.ids.next();
        const now = deps.clock.now();
        const resolved: ProductionOrderBacklogCommitResult['resolved'][number][] =
          [];

        for (const candidate of ready) {
          const changed = await repo.resolveOrder({
            locationId: command.locationId,
            orderId: candidate.snapshot.orderId,
            actorId: command.actorId,
            expectedVersion: candidate.snapshot.productionVersion,
            lifecycle: candidate.lifecycle,
            reason: command.reason,
            note: command.note,
            bulkOperationId,
            now,
          });
          if (changed === null)
            return result.err(
              conflictFailure({
                code: 'production_order_backlog_commit_conflict',
                message:
                  'An order changed while the old-order backlog was being committed. No orders were archived.',
                safeMessage:
                  'An order changed while the old-order backlog was being committed. No orders were archived.',
              }),
            );

          resolved.push(changed);
          const orderIdentity = perOrderCommandIdentity({
            command,
            orderId: changed.orderId,
            expectedVersion: candidate.snapshot.productionVersion,
            bulkOperationId,
          });
          await repo.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'production_order_bulk_resolved_without_production',
            entityType: 'production_order',
            entityId: changed.orderId,
            actorId: command.actorId,
            expectedVersion: candidate.snapshot.productionVersion,
            idempotencyKey: perOrderIdempotencyKey(
              command.idempotencyKey,
              changed.orderId,
            ),
            payload: {
              bulkOperationId,
              previewHash: command.previewHash,
              from: candidate.lifecycle.from,
              resolutionState: changed.resolutionState,
              reason: command.reason,
              version: changed.version,
            },
            idempotency: {
              command: orderIdentity,
              result: {
                bulkOperationId,
                orderId: changed.orderId,
                resolutionState: changed.resolutionState,
                version: changed.version,
              },
            },
          });
        }

        const committed: ProductionOrderBacklogCommitResult = {
          locationId: command.locationId,
          bulkOperationId,
          previewHash: command.previewHash,
          nextCursor: nextCursorFor(command, classified, deps.cursor),
          resolvedCount: resolved.length,
          resolved,
          committedAt: now.toISOString(),
          replayed: false,
        };
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_backlog_bulk_resolution_committed',
          entityType: 'production_order_bulk_resolution',
          entityId: bulkOperationId,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: {
            bulkOperationId,
            previewHash: command.previewHash,
            reason: command.reason,
            cursor: command.cursor,
            nextCursor: committed.nextCursor,
            candidateCount: classified.orders.length,
            resolvedCount: resolved.length,
          },
          idempotency: { command: idempotency, result: committed },
        });

        return result.ok(committed);
      });
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_order_backlog_commit_failed',
          message: 'The old-order backlog could not be archived.',
          safeMessage: 'The old-order backlog could not be archived.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
