import type { ReviewProductionOrderBacklogFailure } from './review-production-order-backlog.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  FindWorkEvent,
  WorkEventInput,
} from '../../../foundations/language/commands/production-command.model.ts';
import type { ResultUnitOfWork } from '@pressly/kernel';
import type {
  BacklogSnapshotScope,
  CommitProductionOrderBacklogCommand,
  PreviewProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogPreview,
  ProductionOrderBacklogSnapshot,
  ResolveProductionOrderBacklogInput,
  ResolveProductionOrderBacklogResult,
} from './review-production-order-backlog.model.ts';

export type PreviewProductionOrderBacklog = (
  command: PreviewProductionOrderBacklogCommand,
) => Promise<
  Result<ProductionOrderBacklogPreview, ReviewProductionOrderBacklogFailure>
>;

export type CommitProductionOrderBacklog = (
  command: CommitProductionOrderBacklogCommand,
) => Promise<
  Result<
    ProductionOrderBacklogCommitResult,
    ReviewProductionOrderBacklogFailure
  >
>;

type LoadSnapshot = (
  scope: BacklogSnapshotScope,
) => Promise<ProductionOrderBacklogSnapshot>;

export type ReviewProductionOrderBacklogTransaction = Readonly<{
  findWorkEvent: FindWorkEvent;
  lockLocationScheduling: (locationId: string) => Promise<void>;
  loadSnapshotForUpdate: LoadSnapshot;
  resolveOrder: (
    input: ResolveProductionOrderBacklogInput,
  ) => Promise<ResolveProductionOrderBacklogResult | null>;
  appendWorkEvent: (event: WorkEventInput) => Promise<void>;
}>;

export type ReviewProductionOrderBacklogRepository = Readonly<{
  loadSnapshot: LoadSnapshot;
}> &
  ResultUnitOfWork<ReviewProductionOrderBacklogTransaction>;
