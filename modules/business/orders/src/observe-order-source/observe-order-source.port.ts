import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type { OrderTransactionPort } from '../order-transaction.port.ts';
import type {
  FulfillmentInput,
  ObserveOrderSourceCommand,
  OrderCustomer,
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
  }>;

export type ApplyOrderSourceInput = Readonly<{
  current: StoredOrderSourceState;
  observation: ObserveOrderSourceCommand;
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
  missingAuthorities: readonly string[];
}>;

export type ObserveOrderSourceOperations = Readonly<{
  lockSource: (command: ObserveOrderSourceCommand) => Promise<void>;
  loadSource: (
    command: ObserveOrderSourceCommand,
  ) => Promise<StoredOrderSourceState | null>;
  createSourceOrder: (
    command: ObserveOrderSourceCommand,
  ) => Promise<OrderMutationResult>;
  applySourceOrder: (input: ApplyOrderSourceInput) => Promise<void>;
}>;

export type ObserveOrderSourceRepository =
  OrderTransactionPort<ObserveOrderSourceOperations>;
