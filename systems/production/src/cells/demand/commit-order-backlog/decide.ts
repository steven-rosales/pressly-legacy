import type { ProductionOrderResolutionLifecycleDecision } from '../../../model/public.ts';
import type {
  ClassifiedProductionOrderBacklogOrder,
  ClassifiedProductionOrderBacklogSnapshot,
} from '../../../read-models/production-order-backlog/model.ts';
import { hashProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/project.ts';
import { commitOrderBacklogPreviewStale } from './failures.ts';
import type {
  CommitOrderBacklogCommand,
  CommitOrderBacklogExpectedFailure,
} from './types.ts';

export type ReadyCommitOrderBacklogCandidate =
  ClassifiedProductionOrderBacklogOrder &
    Readonly<{ lifecycle: ProductionOrderResolutionLifecycleDecision }>;

export type CommitOrderBacklogDecision =
  | Readonly<{
      kind: 'commit';
      candidates: readonly ReadyCommitOrderBacklogCandidate[];
    }>
  | Readonly<{
      kind: 'reject';
      failure: CommitOrderBacklogExpectedFailure;
    }>;

export const decideCommitOrderBacklog = (input: {
  command: CommitOrderBacklogCommand;
  classified: ClassifiedProductionOrderBacklogSnapshot;
}): CommitOrderBacklogDecision => {
  const actualHash = hashProductionOrderBacklogPreview(
    input.command,
    input.classified,
  );
  if (actualHash !== input.command.previewHash)
    return { kind: 'reject', failure: commitOrderBacklogPreviewStale() };

  return {
    kind: 'commit',
    candidates: input.classified.orders.filter(
      (order): order is ReadyCommitOrderBacklogCandidate =>
        order.item.category === 'ready_to_archive' && order.lifecycle !== null,
    ),
  };
};
