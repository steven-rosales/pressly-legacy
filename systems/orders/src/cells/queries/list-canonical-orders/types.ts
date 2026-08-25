import type {
  CanonicalOrderSummary,
  OrderState,
} from '../../../model/canonical-order/model.ts';

export const listCanonicalOrdersOperationId =
  'orders.list-canonical-orders.v1' as const;

export type ListCanonicalOrdersQuery = Readonly<{
  businessId: string;
  locationIds: readonly string[];
  query: string | null;
  state: OrderState | null;
  limit: number;
  cursor: string | null;
}>;

export type CanonicalOrderListResult = Readonly<{
  items: readonly CanonicalOrderSummary[];
  nextCursor: string | null;
}>;

export type ListCanonicalOrdersExpectedFailure = Readonly<{
  kind: 'validation';
  code: 'order_list_invalid' | 'order_cursor_invalid';
  message: string;
}>;

export type ListCanonicalOrdersRepository = Readonly<{
  list: (input: {
    query: ListCanonicalOrdersQuery;
    cursor: Readonly<{ dueAt: Date; id: string }> | null;
  }) => Promise<CanonicalOrderListResult>;
}>;
