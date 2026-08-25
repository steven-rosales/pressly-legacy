import type { ProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/contract.ts';
import type {
  ClassifiedProductionOrderBacklogSnapshot,
  ProductionOrderBacklogCursorCodec,
  ProductionOrderBacklogItem,
  ProductionOrderBacklogScope,
} from '../../../read-models/production-order-backlog/model.ts';
import { hashProductionOrderBacklogPreview } from '../../../read-models/production-order-backlog/project.ts';

export const projectPreviewOrderBacklog = (input: {
  request: ProductionOrderBacklogScope;
  classified: ClassifiedProductionOrderBacklogSnapshot;
  generatedAt: Date;
  cursor: ProductionOrderBacklogCursorCodec;
}): ProductionOrderBacklogPreview => {
  const lastOrder = input.classified.orders.at(-1)?.snapshot;
  const nextCursor =
    input.classified.hasMore && lastOrder !== undefined
      ? input.cursor.encode(input.request, {
          dueAt: lastOrder.dueAt,
          orderId: lastOrder.orderId,
        })
      : null;
  const inCategory = (category: ProductionOrderBacklogItem['category']) =>
    input.classified.orders
      .filter(({ item }) => item.category === category)
      .map(({ item }) => ({ ...item, reasons: [...item.reasons] }));

  return {
    locationId: input.request.locationId,
    filter: input.request.filter,
    cutoff: input.request.cutoff,
    reason: input.request.reason,
    maxOrders: input.request.maxOrders,
    candidateCount: input.classified.orders.length,
    hasMore: input.classified.hasMore,
    cursor: input.request.cursor,
    nextCursor,
    previewHash: hashProductionOrderBacklogPreview(
      input.request,
      input.classified,
    ),
    generatedAt: input.generatedAt.toISOString(),
    groups: {
      readyToArchive: inCategory('ready_to_archive'),
      reviewIndividually: inCategory('review_individually'),
      keptForSafety: inCategory('kept_for_safety'),
      alreadyHistorical: inCategory('already_historical'),
    },
  };
};
