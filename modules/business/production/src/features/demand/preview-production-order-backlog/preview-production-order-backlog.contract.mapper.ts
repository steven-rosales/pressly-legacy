import type {
  PreviewProductionOrderBacklogCommand as PreviewProductionOrderBacklogWireCommand,
  ProductionOrderBacklogCursor as ProductionOrderBacklogWireCursor,
  ProductionOrderBacklogPreview as ProductionOrderBacklogWirePreview,
} from '@pressly/contracts/production';
import type { ProductionOrderBacklogPreviewItem } from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogScope } from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';
import type { ProductionOrderBacklogPreview } from './preview-production-order-backlog.model.ts';

type PreviewProductionOrderBacklogRequest = Omit<
  PreviewProductionOrderBacklogWireCommand,
  'locationId'
>;

export const toPreviewProductionOrderBacklogCommand = (
  request: PreviewProductionOrderBacklogRequest,
  locationId: string,
): ProductionOrderBacklogScope => ({
  locationId,
  filter: request.filter,
  cutoff: request.cutoff,
  reason: request.reason,
  cursor: request.cursor,
  maxOrders: request.maxOrders,
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
  cursor: preview.cursor as ProductionOrderBacklogWireCursor | null,
  nextCursor: preview.nextCursor as ProductionOrderBacklogWireCursor | null,
  previewHash: preview.previewHash,
  generatedAt: preview.generatedAt,
  groups: {
    readyToArchive: preview.groups.readyToArchive.map(toPreviewItem),
    reviewIndividually: preview.groups.reviewIndividually.map(toPreviewItem),
    keptForSafety: preview.groups.keptForSafety.map(toPreviewItem),
    alreadyHistorical: preview.groups.alreadyHistorical.map(toPreviewItem),
  },
});
