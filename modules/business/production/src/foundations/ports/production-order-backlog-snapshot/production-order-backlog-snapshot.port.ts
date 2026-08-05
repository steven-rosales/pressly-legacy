import type {
  ProductionOrderBacklogSnapshot,
  ProductionOrderBacklogSnapshotScope,
} from '../../language/production-order-backlog/production-order-backlog.model.ts';

export type ProductionOrderBacklogSnapshotReader = (
  scope: ProductionOrderBacklogSnapshotScope,
) => Promise<ProductionOrderBacklogSnapshot>;
