import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderItemInput,
  OrderState,
} from '../order-model/order.model.ts';

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

export type ListCanonicalOrders = (
  query: ListCanonicalOrdersQuery,
) => Promise<Result<CanonicalOrderListResult, AppError>>;

export type GetCanonicalOrder = (query: {
  businessId: string;
  locationIds: readonly string[];
  orderId: string;
}) => Promise<Result<CanonicalOrderDetail, AppError>>;

export type ReadOrdersRepository = Readonly<{
  list: (
    query: ListCanonicalOrdersQuery,
  ) => Promise<
    | Readonly<{ kind: 'ok'; value: CanonicalOrderListResult }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
  get: (query: {
    businessId: string;
    locationIds: readonly string[];
    orderId: string;
  }) => Promise<CanonicalOrderDetail | null>;
}>;
