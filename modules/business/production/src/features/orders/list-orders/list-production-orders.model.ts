import type {
  ProductionOrderListItem,
  ProductionOrderStatus,
} from '../../../foundations/language/orders/production-order-list-item.model.ts';

export type ListProductionOrdersCommand = Readonly<{
  locationId: string;
  status?: ProductionOrderStatus;
  dueAfter?: Date;
  dueBefore?: Date;
  cursor?: string;
  limit: number;
}>;

export type ProductionOrderPage = Readonly<{
  items: readonly ProductionOrderListItem[];
  nextCursor: string | null;
  asOf: Date;
}>;
