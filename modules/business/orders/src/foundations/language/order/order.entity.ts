import type {
  FulfillmentInput,
  OrderCustomer,
  OrderState,
} from './order.model.ts';

export type Order = Readonly<{
  id: string;
  businessId: string;
  version: number;
  customerUserId: string | null;
  customerResolution: OrderCustomer['resolution'];
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
}>;

export type Fulfillment = FulfillmentInput &
  Readonly<{
    id: string;
    businessId: string;
    orderId: string;
    version: number;
  }>;

/**
 * Version-one application constraint: every supported Order has exactly one
 * fulfillment. The relational schema remains one-to-many for future order
 * types, but commands reject an ambiguous or missing aggregate.
 */
export type OrderAggregate = Readonly<{
  order: Order;
  fulfillment: Fulfillment;
}>;
