import type { CommandContext } from '@pressly/cells/command-context';
import type { DirectFulfillmentInput, OrderItemInput } from '../order-input.ts';
import type { OrderCustomerSnapshot } from './customer-snapshot.ts';

export type OrderState = 'open' | 'completed' | 'canceled';
export type FulfillmentReleaseState = 'unreleased' | 'released' | 'withdrawn';

export type OrderCustomer =
  | Readonly<{
      resolution: 'resolved';
      userId: string;
      externalUserId: string | null;
    }>
  | Readonly<{
      resolution: 'not_provided';
      userId: null;
      externalUserId: null;
    }>
  | Readonly<{
      resolution: 'pending' | 'conflict';
      userId: null;
      externalUserId: string;
    }>;

export type FulfillmentInput = DirectFulfillmentInput &
  Readonly<{
    releaseState: FulfillmentReleaseState;
  }>;

export type CanonicalOrderInput = Readonly<{
  customer: OrderCustomer;
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: FulfillmentInput;
}>;

export type DirectCanonicalOrderInput = Omit<
  CanonicalOrderInput,
  'state' | 'fulfillment'
> &
  Readonly<{ fulfillment: DirectFulfillmentInput }>;

export type StoredOrder = Readonly<{
  id: string;
  businessId: string;
  version: number;
  customerId: string | null;
  customerSnapshot: OrderCustomerSnapshot | null;
  customerResolution: OrderCustomer['resolution'];
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
}>;

export type StoredFulfillment = FulfillmentInput &
  Readonly<{
    id: string;
    businessId: string;
    orderId: string;
    version: number;
  }>;

export type OrderAggregate = Readonly<{
  order: StoredOrder;
  fulfillment: StoredFulfillment;
}>;

export type OrderMutationResult = Readonly<{
  orderId: string;
  fulfillmentId: string;
  version: number;
  replayed: boolean;
}>;

export type StoredOrderCommandReceipt = Readonly<{
  commandHash: string;
  result: OrderMutationResult;
}>;

export type AuditedOrderCommand<ReasonCode extends string> = Readonly<{
  businessId: string;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: ReasonCode;
  reasonNote: string | null;
}>;

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
  }>;
  createdAt: Date;
  updatedAt: Date;
}>;

export type CanonicalOrderDetail = CanonicalOrderSummary &
  Readonly<{ items: readonly OrderItemInput[] }>;
