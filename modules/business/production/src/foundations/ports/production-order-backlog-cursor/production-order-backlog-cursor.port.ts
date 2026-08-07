import type { Result } from '@pressly/kernel';
import type { ProductionOrderBacklogCursorFailure } from '../../language/production-order-backlog/production-order-backlog.failure.ts';
import type {
  ProductionOrderBacklogCursor,
  ProductionOrderBacklogScope,
  ProductionOrderBacklogSnapshotOrder,
  ProductionOrderBacklogSnapshotScope,
} from '../../language/production-order-backlog/production-order-backlog.model.ts';

export type ProductionOrderBacklogCursorCodec = Readonly<{
  encode: (
    scope: Pick<
      ProductionOrderBacklogScope,
      'locationId' | 'filter' | 'cutoff' | 'reason'
    >,
    order: Pick<ProductionOrderBacklogSnapshotOrder, 'dueAt' | 'orderId'>,
  ) => ProductionOrderBacklogCursor;
  decode: (
    cursor: ProductionOrderBacklogCursor | null,
    scope: Pick<
      ProductionOrderBacklogScope,
      'locationId' | 'filter' | 'cutoff' | 'reason'
    >,
  ) => Result<
    ProductionOrderBacklogSnapshotScope['after'],
    ProductionOrderBacklogCursorFailure
  >;
}>;
