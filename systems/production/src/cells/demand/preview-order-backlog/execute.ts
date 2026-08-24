import type { CellOutcome } from '@pressly/cells';
import type { ProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/contract.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { productionOrderBacklogCursor } from '../../../read-models/production-order-backlog/cursor.ts';
import type {
  ProductionOrderBacklogCursorCodec,
  ProductionOrderBacklogPolicy,
  ProductionOrderBacklogScope,
} from '../../../read-models/production-order-backlog/model.ts';
import { classifyProductionOrderBacklogSnapshot } from '../../../read-models/production-order-backlog/project.ts';
import { previewOrderBacklogCursorInvalid } from './failures.ts';
import { projectPreviewOrderBacklog } from './project.ts';
import type {
  PreviewOrderBacklogExpectedFailure,
  PreviewOrderBacklogRepository,
} from './types.ts';

export type PreviewOrderBacklogDependencies = Readonly<{
  repo: PreviewOrderBacklogRepository;
  policy: ProductionOrderBacklogPolicy;
  clock: Readonly<{ now: () => Date }>;
  cursor?: ProductionOrderBacklogCursorCodec;
}>;

export type ExecutePreviewOrderBacklog = (
  input: ProductionOrderBacklogScope,
) => Promise<
  CellOutcome<ProductionOrderBacklogPreview, PreviewOrderBacklogExpectedFailure>
>;

export const makeExecutePreviewOrderBacklog = (
  dependencies: PreviewOrderBacklogDependencies,
): ExecutePreviewOrderBacklog => {
  const cursor = dependencies.cursor ?? productionOrderBacklogCursor;
  return async (input) => {
    const decoded = cursor.decode(input.cursor, input);
    if (decoded.kind === 'invalid')
      return {
        kind: 'failure',
        failure: previewOrderBacklogCursorInvalid(decoded.failure),
      };

    try {
      const snapshot = await dependencies.repo.loadSnapshot({
        locationId: input.locationId,
        filter: input.filter,
        cutoff: new Date(input.cutoff),
        maxOrders: input.maxOrders,
        after: decoded.point,
      });
      const classified = classifyProductionOrderBacklogSnapshot(
        dependencies.policy,
        snapshot,
      );
      const generatedAt = dependencies.clock.now();
      return {
        kind: 'success',
        value: projectPreviewOrderBacklog({
          request: input,
          classified,
          generatedAt,
          cursor,
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_order_backlog_preview_failed',
          message: 'The old-order review could not be prepared.',
          safeMessage: 'The old-order review could not be prepared.',
          status: 503,
          cause,
        }),
      );
    }
  };
};
