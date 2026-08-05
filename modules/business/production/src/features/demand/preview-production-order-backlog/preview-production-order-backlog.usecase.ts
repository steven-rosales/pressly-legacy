import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { validationFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { isProductionFeatureFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import type { ProductionOrderBacklogCursorFailure } from '../../../foundations/language/production-order-backlog/production-order-backlog.failure.ts';
import type {
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
import type { ProductionOrderBacklogScope } from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogPreview } from './preview-production-order-backlog.model.ts';
import type {
  PreviewProductionOrderBacklog,
  PreviewProductionOrderBacklogRepository,
} from './preview-production-order-backlog.port.ts';

const snapshotScope = (
  command: ProductionOrderBacklogScope,
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
  command: ProductionOrderBacklogScope,
  classified: ClassifiedProductionOrderBacklogSnapshot,
  cursor: ProductionOrderBacklogCursorCodec,
): ProductionOrderBacklogCursor | null => {
  const lastOrder = classified.orders.at(-1)?.snapshot;
  return classified.hasMore && lastOrder !== undefined
    ? cursor.encode(command, lastOrder)
    : null;
};

const previewFromSnapshot = (
  command: ProductionOrderBacklogScope,
  classified: ClassifiedProductionOrderBacklogSnapshot,
  generatedAt: Date,
  cursor: ProductionOrderBacklogCursorCodec,
): ProductionOrderBacklogPreview => ({
  locationId: command.locationId,
  filter: command.filter,
  cutoff: command.cutoff,
  reason: command.reason,
  maxOrders: command.maxOrders,
  candidateCount: classified.orders.length,
  hasMore: classified.hasMore,
  cursor: command.cursor,
  nextCursor: nextCursorFor(command, classified, cursor),
  previewHash: hashProductionOrderBacklogPreview(command, classified),
  generatedAt: generatedAt.toISOString(),
  groups: {
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
  },
});

export const makePreviewProductionOrderBacklog = (deps: {
  repo: PreviewProductionOrderBacklogRepository;
  policy: ProductionOrderResolutionPolicy;
  cursor: ProductionOrderBacklogCursorCodec;
  clock: Clock;
}): PreviewProductionOrderBacklog =>
  async function previewProductionOrderBacklog(command) {
    const scope = snapshotScope(command, deps.cursor);
    if (scope.tag === 'err') return result.err(backlogCursorError(scope.error));

    try {
      const snapshot = await deps.repo.loadSnapshot(scope.value);

      return result.ok(
        previewFromSnapshot(
          command,
          classifyProductionOrderBacklogSnapshot(deps.policy, snapshot),
          deps.clock.now(),
          deps.cursor,
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
