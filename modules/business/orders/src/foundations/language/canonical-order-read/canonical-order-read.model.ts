import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderItemInput,
  OrderState,
} from '../order/order.model.ts';

export type CanonicalOrderSummary = Readonly<{
  orderId: string;
  businessId: string;
  orderVersion: number;
  fulfillmentId: string;
  fulfillmentVersion: number;
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  customer: Readonly<{
    resolution: OrderCustomer['resolution'];
    userId: string | null;
    displayName: string | null;
    phone: string | null;
    email: string | null;
  }>;
  fulfillment: Readonly<{
    typeCode: string;
    locationId: string;
    releaseState: FulfillmentReleaseState;
    estimatedWeightLbs: number | null;
    estimatedWeightSource: string | null;
    bagCount: number | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CanonicalOrderDetail = CanonicalOrderSummary &
  Readonly<{ items: readonly OrderItemInput[] }>;
