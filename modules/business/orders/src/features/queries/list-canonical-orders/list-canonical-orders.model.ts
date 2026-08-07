import type { OrderState } from '../../../foundations/language/order/order.model.ts';
import type { CanonicalOrderSummary } from '../../../foundations/language/canonical-order-read/canonical-order-read.model.ts';

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
