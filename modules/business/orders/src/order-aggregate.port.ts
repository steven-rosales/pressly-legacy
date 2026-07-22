import type {
  FulfillmentInput,
  OrderCustomer,
  OrderState,
} from './orders.port.ts';

export type StoredOrderRecord = Readonly<{
  id: string;
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

export type StoredFulfillmentRecord = FulfillmentInput &
  Readonly<{
    id: string;
    orderId: string;
    version: number;
  }>;

/**
 * Version-one application constraint: every supported Order has exactly one
 * fulfillment. The relational schema remains one-to-many for future order
 * types, but commands reject an ambiguous or missing aggregate.
 */
export type StoredOrderAggregate = Readonly<{
  order: StoredOrderRecord;
  fulfillment: StoredFulfillmentRecord;
}>;
