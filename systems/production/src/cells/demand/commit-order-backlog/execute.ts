import type { CellOutcome } from '@pressly/cells';
import { sha256Text } from '@pressly/codec/node';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IdSource } from '@pressly/cells/id-source';
import { productionOrderBacklogCursor } from '../../../read-models/production-order-backlog/cursor.ts';
import type {
  ClassifiedProductionOrderBacklogSnapshot,
  ProductionOrderBacklogCursorCodec,
  ProductionOrderBacklogPolicy,
  ProductionOrderBacklogSnapshotReader,
  ProductionOrderBacklogSnapshotScope,
} from '../../../read-models/production-order-backlog/model.ts';
import { classifyProductionOrderBacklogSnapshot } from '../../../read-models/production-order-backlog/project.ts';
import { decideCommitOrderBacklog } from './decide.ts';
import {
  commitOrderBacklogCursorInvalid,
  commitOrderBacklogIdempotencyConflict,
  commitOrderBacklogWriteConflict,
} from './failures.ts';
import type {
  CommitOrderBacklogCommand,
  CommitOrderBacklogExpectedFailure,
  CommitOrderBacklogResolvedItem,
  CommitOrderBacklogResult,
  ResolveCommitOrderBacklogInput,
} from './types.ts';

export type CommitOrderBacklogBulkCommandIdentity = Readonly<{
  operation: 'production_order_backlog_bulk_resolution';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order_bulk_resolution';
    entityId: null;
  }>;
  expectedVersion: null;
  payload: Readonly<{
    filter: CommitOrderBacklogCommand['filter'];
    cutoff: string;
    reason: CommitOrderBacklogCommand['reason'];
    note: string | null;
    maxOrders: number;
    cursor: CommitOrderBacklogCommand['cursor'];
    previewHash: string;
  }>;
}>;

export type CommitOrderBacklogOrderCommandIdentity = Readonly<{
  operation: 'production_order_bulk_resolved_without_production';
  locationId: string;
  actorId: string;
  target: Readonly<{
    entityType: 'production_order';
    entityId: string;
  }>;
  expectedVersion: number;
  payload: Readonly<{
    bulkOperationId: string;
    previewHash: string;
    reason: CommitOrderBacklogCommand['reason'];
  }>;
}>;

export type CommitOrderBacklogReplay =
  | Readonly<{ kind: 'miss' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'replay'; result: CommitOrderBacklogResult }>;

export type CommitOrderBacklogIdempotency<Stored> = Readonly<{
  resolveReplay: (
    stored: Stored | null,
    expected: CommitOrderBacklogBulkCommandIdentity,
  ) => CommitOrderBacklogReplay;
}>;

export type CommitOrderBacklogOrderWorkEvent = Readonly<{
  locationId: string;
  eventType: 'production_order_bulk_resolved_without_production';
  entityType: 'production_order';
  entityId: string;
  actorId: string;
  expectedVersion: number;
  idempotencyKey: string;
  payload: Readonly<{
    bulkOperationId: string;
    previewHash: string;
    from: 'open' | 'resolved_without_production';
    resolutionState: 'resolved_without_production';
    reason: CommitOrderBacklogCommand['reason'];
    version: number;
  }>;
  idempotency: Readonly<{
    command: CommitOrderBacklogOrderCommandIdentity;
    result: Readonly<{
      bulkOperationId: string;
      orderId: string;
      resolutionState: 'resolved_without_production';
      version: number;
    }>;
  }>;
}>;

export type CommitOrderBacklogReceiptWorkEvent = Readonly<{
  locationId: string;
  eventType: 'production_order_backlog_bulk_resolution_committed';
  entityType: 'production_order_bulk_resolution';
  entityId: string;
  actorId: string;
  expectedVersion: null;
  idempotencyKey: string;
  payload: Readonly<{
    bulkOperationId: string;
    previewHash: string;
    reason: CommitOrderBacklogCommand['reason'];
    cursor: CommitOrderBacklogCommand['cursor'];
    nextCursor: CommitOrderBacklogResult['nextCursor'];
    candidateCount: number;
    resolvedCount: number;
  }>;
  idempotency: Readonly<{
    command: CommitOrderBacklogBulkCommandIdentity;
    result: CommitOrderBacklogResult;
  }>;
}>;

export type CommitOrderBacklogWorkEvent =
  | CommitOrderBacklogOrderWorkEvent
  | CommitOrderBacklogReceiptWorkEvent;

export type CommitOrderBacklogTransactionRepository<Stored> = Readonly<{
  findWorkEvent: (idempotencyKey: string) => Promise<Stored | null>;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSnapshotForUpdate: ProductionOrderBacklogSnapshotReader;
  resolveOrder: (
    input: ResolveCommitOrderBacklogInput,
  ) => Promise<CommitOrderBacklogResolvedItem | null>;
  appendWorkEvent: (event: CommitOrderBacklogWorkEvent) => Promise<void>;
}>;

export type CommitOrderBacklogRepository<Stored> = Readonly<{
  transaction: (
    work: (
      repository: CommitOrderBacklogTransactionRepository<Stored>,
    ) => Promise<
      CellOutcome<CommitOrderBacklogResult, CommitOrderBacklogExpectedFailure>
    >,
  ) => Promise<
    CellOutcome<CommitOrderBacklogResult, CommitOrderBacklogExpectedFailure>
  >;
}>;

export type CommitOrderBacklogDependencies<Stored> = Readonly<{
  repo: CommitOrderBacklogRepository<Stored>;
  idempotency: CommitOrderBacklogIdempotency<Stored>;
  policy: ProductionOrderBacklogPolicy;
  cursor?: ProductionOrderBacklogCursorCodec;
  clock: Readonly<{ now: () => Date }>;
  ids: IdSource;
}>;

export type ExecuteCommitOrderBacklog = (
  command: CommitOrderBacklogCommand,
) => Promise<
  CellOutcome<CommitOrderBacklogResult, CommitOrderBacklogExpectedFailure>
>;

const success = (
  value: CommitOrderBacklogResult,
): CellOutcome<
  CommitOrderBacklogResult,
  CommitOrderBacklogExpectedFailure
> => ({
  kind: 'success',
  value,
});

const failure = (
  value: CommitOrderBacklogExpectedFailure,
): CellOutcome<
  CommitOrderBacklogResult,
  CommitOrderBacklogExpectedFailure
> => ({
  kind: 'failure',
  failure: value,
});

const snapshotScope = (
  command: CommitOrderBacklogCommand,
  cursor: ProductionOrderBacklogCursorCodec,
):
  | Readonly<{ kind: 'valid'; value: ProductionOrderBacklogSnapshotScope }>
  | Readonly<{
      kind: 'invalid';
      failure: CommitOrderBacklogExpectedFailure;
    }> => {
  const decoded = cursor.decode(command.cursor, command);
  if (decoded.kind === 'invalid')
    return {
      kind: 'invalid',
      failure: commitOrderBacklogCursorInvalid(decoded.failure),
    };
  return {
    kind: 'valid',
    value: {
      locationId: command.locationId,
      filter: command.filter,
      cutoff: new Date(command.cutoff),
      maxOrders: command.maxOrders,
      after: decoded.point,
    },
  };
};

const bulkCommandIdentity = (
  command: CommitOrderBacklogCommand,
): CommitOrderBacklogBulkCommandIdentity => ({
  operation: 'production_order_backlog_bulk_resolution',
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: 'production_order_bulk_resolution',
    entityId: null,
  },
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

const orderCommandIdentity = (input: {
  command: CommitOrderBacklogCommand;
  orderId: string;
  expectedVersion: number;
  bulkOperationId: string;
}): CommitOrderBacklogOrderCommandIdentity => ({
  operation: 'production_order_bulk_resolved_without_production',
  locationId: input.command.locationId,
  actorId: input.command.actorId,
  target: { entityType: 'production_order', entityId: input.orderId },
  expectedVersion: input.expectedVersion,
  payload: {
    bulkOperationId: input.bulkOperationId,
    previewHash: input.command.previewHash,
    reason: input.command.reason,
  },
});

export const commitOrderBacklogOrderIdempotencyKey = (
  commandKey: string,
  orderId: string,
): string => `bulk-order:${sha256Text(`${commandKey}\0${orderId}`)}`;

const nextCursorFor = (
  command: CommitOrderBacklogCommand,
  classified: ClassifiedProductionOrderBacklogSnapshot,
  cursor: ProductionOrderBacklogCursorCodec,
) => {
  const lastOrder = classified.orders.at(-1)?.snapshot;
  return classified.hasMore && lastOrder !== undefined
    ? cursor.encode(command, {
        dueAt: lastOrder.dueAt,
        orderId: lastOrder.orderId,
      })
    : null;
};

export const makeExecuteCommitOrderBacklog = <Stored>(
  dependencies: CommitOrderBacklogDependencies<Stored>,
): ExecuteCommitOrderBacklog => {
  const cursor = dependencies.cursor ?? productionOrderBacklogCursor;
  return async (command) => {
    const scope = snapshotScope(command, cursor);
    if (scope.kind === 'invalid') return failure(scope.failure);
    const identity = bulkCommandIdentity(command);

    try {
      return await dependencies.repo.transaction(async (repository) => {
        const replay = dependencies.idempotency.resolveReplay(
          await repository.findWorkEvent(command.idempotencyKey),
          identity,
        );
        if (replay.kind === 'conflict')
          return failure(commitOrderBacklogIdempotencyConflict());
        if (replay.kind === 'replay') return success(replay.result);

        await repository.lockLocationScheduling(command.locationId);
        const replayAfterLock = dependencies.idempotency.resolveReplay(
          await repository.findWorkEvent(command.idempotencyKey),
          identity,
        );
        if (replayAfterLock.kind === 'conflict')
          return failure(commitOrderBacklogIdempotencyConflict());
        if (replayAfterLock.kind === 'replay')
          return success(replayAfterLock.result);

        const classified = classifyProductionOrderBacklogSnapshot(
          dependencies.policy,
          await repository.loadSnapshotForUpdate(scope.value),
        );
        const decision = decideCommitOrderBacklog({ command, classified });
        if (decision.kind === 'reject') return failure(decision.failure);

        const bulkOperationId = dependencies.ids.next();
        const now = dependencies.clock.now();
        const resolved: CommitOrderBacklogResolvedItem[] = [];
        for (const candidate of decision.candidates) {
          const changed = await repository.resolveOrder({
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
            return failure(commitOrderBacklogWriteConflict());

          resolved.push(changed);
          const orderIdentity = orderCommandIdentity({
            command,
            orderId: changed.orderId,
            expectedVersion: candidate.snapshot.productionVersion,
            bulkOperationId,
          });
          await repository.appendWorkEvent({
            locationId: command.locationId,
            eventType: 'production_order_bulk_resolved_without_production',
            entityType: 'production_order',
            entityId: changed.orderId,
            actorId: command.actorId,
            expectedVersion: candidate.snapshot.productionVersion,
            idempotencyKey: commitOrderBacklogOrderIdempotencyKey(
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
              result: { bulkOperationId, ...changed },
            },
          });
        }

        const committed: CommitOrderBacklogResult = {
          locationId: command.locationId,
          bulkOperationId,
          previewHash: command.previewHash,
          nextCursor: nextCursorFor(command, classified, cursor),
          resolvedCount: resolved.length,
          resolved,
          committedAt: now.toISOString(),
          replayed: false,
        };
        await repository.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_order_backlog_bulk_resolution_committed',
          entityType: 'production_order_bulk_resolution',
          entityId: bulkOperationId,
          actorId: command.actorId,
          expectedVersion: null,
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
          idempotency: { command: identity, result: committed },
        });
        return success(committed);
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_backlog_commit_failed',
          message: 'The old-order backlog could not be archived.',
          safeMessage: 'The old-order backlog could not be archived.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
