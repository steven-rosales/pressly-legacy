import {
  validationFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { canonicalSha256, sha256Text } from '@pressly/codec/node';
import { conflictFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result, type Result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import {
  assessProductionOrderResolution,
  type ProductionOrderResolutionPolicy,
} from '../../../foundations/language/resolution/production-order-resolution.policy.ts';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { WorkEventCommandIdentity } from '../../../foundations/language/commands/production-command.model.ts';
import type { ProductionOrderResolutionLifecycleDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  BacklogSnapshotScope,
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogClassificationReason,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogPreview,
  ProductionOrderBacklogPreviewItem,
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotOrder,
  PreviewProductionOrderBacklogCommand,
} from './review-production-order-backlog.model.ts';
import type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
  ReviewProductionOrderBacklogRepository,
} from './review-production-order-backlog.port.ts';
import type { ProductionOrderBacklogCursorFailure } from './review-production-order-backlog.failure.ts';
import { productionOrderBacklogCursor } from './production-order-backlog-cursor.contract.mapper.ts';
export type {
  CommitProductionOrderBacklog,
  PreviewProductionOrderBacklog,
} from './review-production-order-backlog.port.ts';

type ClassifiedOrder = Readonly<{
  snapshot: ProductionOrderBacklogSnapshotOrder;
  item: ProductionOrderBacklogPreviewItem;
  lifecycle: ProductionOrderResolutionLifecycleDecision | null;
}>;

type ClassifiedSnapshot = Readonly<{
  orders: readonly ClassifiedOrder[];
  hasMore: boolean;
}>;

type BacklogCursorScope = Pick<
  PreviewProductionOrderBacklogCommand,
  'locationId' | 'filter' | 'cutoff' | 'reason'
>;

const parseBacklogCursor = (
  command: PreviewProductionOrderBacklogCommand,
): Result<BacklogSnapshotScope['after'], ProductionOrderBacklogCursorFailure> =>
  productionOrderBacklogCursor.decode(command.cursor, command);

const snapshotHashPayload = (
  input: PreviewProductionOrderBacklogCommand,
  classified: ClassifiedSnapshot,
) => ({
  version: 2,
  locationId: input.locationId,
  filter: input.filter,
  cutoff: input.cutoff,
  reason: input.reason,
  maxOrders: input.maxOrders,
  cursor: input.cursor,
  hasMore: classified.hasMore,
  candidates: [...classified.orders]
    .sort((left, right) =>
      left.snapshot.orderId.localeCompare(right.snapshot.orderId),
    )
    .map(({ snapshot, item }) => ({
      orderId: snapshot.orderId,
      // Production order version is the aggregate concurrency token for both
      // ordinary order facts and the orthogonal resolution projection.
      orderVersion: snapshot.productionVersion,
      resolutionState: snapshot.resolutionState,
      executionStatus: snapshot.executionStatus,
      operationalStatus: snapshot.operationalStatus,
      dueAt: snapshot.dueAt.toISOString(),
      guardFacts: {
        hasIntake: snapshot.hasIntake,
        hasManualAdmission: snapshot.hasManualAdmission,
        isPriority: snapshot.isPriority,
        hasPendingPlacement: snapshot.hasPendingPlacement,
        hasShiftSelection: snapshot.hasShiftSelection,
        hasBatchMembership: snapshot.hasBatchMembership,
        hasStageAttempt: snapshot.hasStageAttempt,
        hasRoute: snapshot.hasRoute,
      },
      classification: item.category,
      reasons: [...item.reasons].sort(),
    })),
});

export const hashProductionOrderBacklogPreview = (
  input: PreviewProductionOrderBacklogCommand,
  classified: ClassifiedSnapshot,
): string => canonicalSha256(snapshotHashPayload(input, classified));

const item = (
  order: ProductionOrderBacklogSnapshotOrder,
  category: ProductionOrderBacklogPreviewItem['category'],
  reasons: readonly ProductionOrderBacklogClassificationReason[],
): ProductionOrderBacklogPreviewItem => ({
  orderId: order.orderId,
  displayReference: order.displayReference,
  dueAt: order.dueAt.toISOString(),
  category,
  reasons: [...reasons],
  expectedVersion: order.productionVersion,
  expectedResolutionState: order.resolutionState,
});

const classifyOrder = (
  policy: ProductionOrderResolutionPolicy,
  order: ProductionOrderBacklogSnapshotOrder,
): ClassifiedOrder => {
  const assessment = assessProductionOrderResolution(policy, {
    resolutionState: order.resolutionState,
    executionStatus: order.executionStatus,
    operationalStatus: order.operationalStatus,
    expectedVersion: order.productionVersion,
    hasShiftSelection: order.hasShiftSelection,
    hasBatchMembership: order.hasBatchMembership,
    hasStageAttempt: order.hasStageAttempt,
    hasRoute: order.hasRoute,
    hasIntake: order.hasIntake,
    hasManualAdmission: order.hasManualAdmission,
    isPriority: order.isPriority,
    hasPendingPlacement: order.hasPendingPlacement,
  });

  if (assessment.status === 'already_historical')
    return {
      snapshot: order,
      item: item(order, 'already_historical', [assessment.reason]),
      lifecycle: null,
    };
  if (assessment.status === 'blocked')
    return {
      snapshot: order,
      item: item(order, 'kept_for_safety', assessment.reasons),
      lifecycle: null,
    };
  if (assessment.requiresExplicitReview)
    return {
      snapshot: order,
      item: item(order, 'review_individually', assessment.reviewReasons),
      lifecycle: null,
    };

  return {
    snapshot: order,
    item: item(order, 'ready_to_archive', ['no_operator_owned_facts']),
    lifecycle: assessment.lifecycle,
  };
};

export const classifyProductionOrderBacklogSnapshot = (
  policy: ProductionOrderResolutionPolicy,
  snapshot: ProductionOrderBacklogSnapshot,
): ClassifiedSnapshot => ({
  orders: snapshot.orders.map((order) => classifyOrder(policy, order)),
  hasMore: snapshot.hasMore,
});

const scope = (
  command: PreviewProductionOrderBacklogCommand,
): Result<BacklogSnapshotScope, ProductionOrderBacklogCursorFailure> => {
  const after = parseBacklogCursor(command);
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
  command: BacklogCursorScope,
  classified: ClassifiedSnapshot,
): ProductionOrderBacklogCursor | null => {
  const lastOrder = classified.orders.at(-1)?.snapshot;
  return classified.hasMore && lastOrder !== undefined
    ? productionOrderBacklogCursor.encode(command, lastOrder)
    : null;
};

const previewFromSnapshot = (
  command: PreviewProductionOrderBacklogCommand,
  classified: ClassifiedSnapshot,
  generatedAt: Date,
): ProductionOrderBacklogPreview => {
  const nextCursor = nextCursorFor(command, classified);
  const groups = {
    readyToArchive: classified.orders
      .filter(({ item }) => item.category === 'ready_to_archive')
      .map(({ item }) => item),
    reviewIndividually: classified.orders
      .filter(({ item }) => item.category === 'review_individually')
      .map(({ item }) => item),
    keptForSafety: classified.orders
      .filter(({ item }) => item.category === 'kept_for_safety')
      .map(({ item }) => item),
    alreadyHistorical: classified.orders
      .filter(({ item }) => item.category === 'already_historical')
      .map(({ item }) => item),
  };

  return {
    locationId: command.locationId,
    filter: command.filter,
    cutoff: command.cutoff,
    reason: command.reason,
    maxOrders: command.maxOrders,
    candidateCount: classified.orders.length,
    hasMore: classified.hasMore,
    cursor: command.cursor,
    nextCursor,
    previewHash: hashProductionOrderBacklogPreview(command, classified),
    generatedAt: generatedAt.toISOString(),
    groups,
  };
};

export const makePreviewProductionOrderBacklog =
  (deps: {
    repo: ReviewProductionOrderBacklogRepository;
    policy: ProductionOrderResolutionPolicy;
    clock: Clock;
  }): PreviewProductionOrderBacklog =>
  async (command) => {
    const snapshotScope = scope(command);
    if (snapshotScope.tag === 'err')
      return result.err(backlogCursorError(snapshotScope.error));

    try {
      const snapshot = await deps.repo.loadSnapshot(snapshotScope.value);
      return result.ok(
        previewFromSnapshot(
          command,
          classifyProductionOrderBacklogSnapshot(deps.policy, snapshot),
          deps.clock.now(),
        ),
      );
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_order_backlog_preview_failed',
          message: 'The old-order review could not be prepared.',
          safeMessage: 'The old-order review could not be prepared.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
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

export const makeCommitProductionOrderBacklog =
  (deps: {
    repo: ReviewProductionOrderBacklogRepository;
    policy: ProductionOrderResolutionPolicy;
    clock: Clock;
    ids: IdSource;
  }): CommitProductionOrderBacklog =>
  async (command) => {
    const snapshotScope = scope(command);
    if (snapshotScope.tag === 'err')
      return result.err(backlogCursorError(snapshotScope.error));

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

        const snapshot = await repo.loadSnapshotForUpdate(snapshotScope.value);
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
          ): order is ClassifiedOrder & {
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
          nextCursor: nextCursorFor(command, classified),
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
