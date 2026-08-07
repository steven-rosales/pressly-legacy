import type {
  CommitProductionOrderBacklogCommand as CommitProductionOrderBacklogWireCommand,
  ProductionOrderBacklogCommitResult as ProductionOrderBacklogWireCommitResult,
  ProductionOrderBacklogCursor as ProductionOrderBacklogWireCursor,
} from '@pressly/contracts/production';
import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
} from './commit-production-order-backlog.model.ts';

type CommitProductionOrderBacklogRequest = Omit<
  CommitProductionOrderBacklogWireCommand,
  'locationId'
>;

export const toCommitProductionOrderBacklogCommand = (
  request: CommitProductionOrderBacklogRequest,
  scope: Readonly<{ locationId: string; actorId: string }>,
): CommitProductionOrderBacklogCommand => ({
  ...scope,
  filter: request.filter,
  cutoff: request.cutoff,
  reason: request.reason,
  cursor: request.cursor,
  maxOrders: request.maxOrders,
  note: request.note,
  previewHash: request.previewHash,
  idempotencyKey: request.idempotencyKey,
});

export const toProductionOrderBacklogCommitResult = (
  result: ProductionOrderBacklogCommitResult,
): ProductionOrderBacklogWireCommitResult => ({
  locationId: result.locationId,
  bulkOperationId: result.bulkOperationId,
  previewHash: result.previewHash,
  nextCursor: result.nextCursor as ProductionOrderBacklogWireCursor | null,
  resolvedCount: result.resolvedCount,
  resolved: result.resolved.map((order) => ({ ...order })),
  committedAt: result.committedAt,
  replayed: result.replayed,
});
