export {
  commitProductionOrderBacklogRequestSchema,
  previewProductionOrderBacklogRequestSchema,
  productionLocationParamsSchema,
  productionOrderBacklogCommitResultSchema,
  productionOrderBacklogPreviewSchema,
} from '@pressly/contracts/production';
import type {
  CommitProductionOrderBacklogCommand as CommitProductionOrderBacklogWireCommand,
  ProductionOrderBacklogCommitResult as ProductionOrderBacklogWireCommitResult,
  ProductionOrderBacklogCursor as ProductionOrderBacklogWireCursor,
  ProductionOrderBacklogPreview as ProductionOrderBacklogWirePreview,
  PreviewProductionOrderBacklogCommand as PreviewProductionOrderBacklogWireCommand,
} from '@pressly/contracts/production';
import type {
  CommitProductionOrderBacklogCommand,
  ProductionOrderBacklogCommitResult,
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogPreview,
  ProductionOrderBacklogPreviewItem,
  PreviewProductionOrderBacklogCommand,
} from './review-production-order-backlog.model.ts';

type PreviewProductionOrderBacklogRequest = Omit<
  PreviewProductionOrderBacklogWireCommand,
  'locationId'
>;

type CommitProductionOrderBacklogRequest = Omit<
  CommitProductionOrderBacklogWireCommand,
  'locationId'
>;

const toWireCursor = (
  cursor: ProductionOrderBacklogCursor | null,
): ProductionOrderBacklogWireCursor | null =>
  cursor as ProductionOrderBacklogWireCursor | null;

export const toPreviewProductionOrderBacklogCommand = (
  request: PreviewProductionOrderBacklogRequest,
  locationId: string,
): PreviewProductionOrderBacklogCommand => ({
  locationId,
  filter: request.filter,
  cutoff: request.cutoff,
  reason: request.reason,
  cursor: request.cursor,
  maxOrders: request.maxOrders,
});

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

const toPreviewItem = (
  item: ProductionOrderBacklogPreviewItem,
): ProductionOrderBacklogWirePreview['groups']['readyToArchive'][number] => ({
  orderId: item.orderId,
  displayReference: item.displayReference,
  dueAt: item.dueAt,
  category: item.category,
  reasons: [...item.reasons],
  expectedVersion: item.expectedVersion,
  expectedResolutionState: item.expectedResolutionState,
});

export const toProductionOrderBacklogPreviewResult = (
  preview: ProductionOrderBacklogPreview,
): ProductionOrderBacklogWirePreview => ({
  locationId: preview.locationId,
  filter: preview.filter,
  cutoff: preview.cutoff,
  reason: preview.reason,
  maxOrders: preview.maxOrders,
  candidateCount: preview.candidateCount,
  hasMore: preview.hasMore,
  cursor: toWireCursor(preview.cursor),
  nextCursor: toWireCursor(preview.nextCursor),
  previewHash: preview.previewHash,
  generatedAt: preview.generatedAt,
  groups: {
    readyToArchive: preview.groups.readyToArchive.map(toPreviewItem),
    reviewIndividually: preview.groups.reviewIndividually.map(toPreviewItem),
    keptForSafety: preview.groups.keptForSafety.map(toPreviewItem),
    alreadyHistorical: preview.groups.alreadyHistorical.map(toPreviewItem),
  },
});

export const toProductionOrderBacklogCommitResult = (
  result: ProductionOrderBacklogCommitResult,
): ProductionOrderBacklogWireCommitResult => ({
  locationId: result.locationId,
  bulkOperationId: result.bulkOperationId,
  previewHash: result.previewHash,
  nextCursor: toWireCursor(result.nextCursor),
  resolvedCount: result.resolvedCount,
  resolved: result.resolved.map((order) => ({ ...order })),
  committedAt: result.committedAt,
  replayed: result.replayed,
});
