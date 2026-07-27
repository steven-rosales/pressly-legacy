import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type { OrderTransactionPort } from '../order-transaction.port.ts';
import type {
  FulfillmentInput,
  ObserveOrderSourceCommand,
  OrderCustomer,
  OrderInput,
  OrderItemInput,
  OrderMutationResult,
  OrderState,
} from '../orders.port.ts';

export type StoredOrderFieldAuthority = Readonly<{
  authority: 'pressly' | 'source';
  source: string | null;
}>;

export type StoredOrderSourceState = StoredOrderAggregate &
  Readonly<{
    sourceLinkId: string;
    revision: Readonly<{ at: Date; hash: string }> | null;
    authorities: ReadonlyMap<string, StoredOrderFieldAuthority>;
    items: readonly OrderItemInput[];
  }>;

export type CreateOrderSourceInput = Readonly<{
  observation: ObserveOrderSourceCommand;
  canonical: OrderInput;
}>;

export type RetainOrderSourceObservationInput = Readonly<{
  current: StoredOrderSourceState;
  observation: ObserveOrderSourceCommand;
  missingAuthorities: readonly string[];
}>;

export type ApplyOrderSourceAdoptionInput = Readonly<{
  current: StoredOrderSourceState;
  observedAt: Date;
  nextOrder: Readonly<{
    customerUserId: string | null;
    customerResolution: OrderCustomer['resolution'];
    displayNumber: string | null;
    state: OrderState;
    dueAt: Date;
    currency: string;
    totalAmountCents: number;
    balanceDueCents: number | null;
  }>;
  nextFulfillment: FulfillmentInput;
  nextOrderVersion: number;
  nextFulfillmentVersion: number;
  items: readonly OrderItemInput[];
}>;

export type ObserveOrderSourceOperations = Readonly<{
  lockSource: (command: ObserveOrderSourceCommand) => Promise<void>;
  loadSource: (
    command: ObserveOrderSourceCommand,
  ) => Promise<StoredOrderSourceState | null>;
  createSourceOrder: (
    input: CreateOrderSourceInput,
  ) => Promise<OrderMutationResult>;
  retainSourceObservation: (
    input: RetainOrderSourceObservationInput,
  ) => Promise<void>;
  applySourceAdoption: (input: ApplyOrderSourceAdoptionInput) => Promise<void>;
}>;

export type ObserveOrderSourceRepository =
  OrderTransactionPort<ObserveOrderSourceOperations>;
