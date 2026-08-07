import type {
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogPreviewItem,
  ProductionOrderBacklogScope,
} from '../../../foundations/language/production-order-backlog/production-order-backlog.model.ts';

export type ProductionOrderBacklogPreview = Readonly<{
  locationId: string;
  filter: ProductionOrderBacklogScope['filter'];
  cutoff: string;
  reason: ProductionOrderBacklogScope['reason'];
  maxOrders: number;
  candidateCount: number;
  hasMore: boolean;
  cursor: ProductionOrderBacklogCursor | null;
  nextCursor: ProductionOrderBacklogCursor | null;
  previewHash: string;
  generatedAt: string;
  groups: Readonly<{
    readyToArchive: readonly ProductionOrderBacklogPreviewItem[];
    reviewIndividually: readonly ProductionOrderBacklogPreviewItem[];
    keptForSafety: readonly ProductionOrderBacklogPreviewItem[];
    alreadyHistorical: readonly ProductionOrderBacklogPreviewItem[];
  }>;
}>;
