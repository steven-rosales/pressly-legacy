import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { CorrectOrderCommand } from '../orders.port.ts';

export type CorrectOrderOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    lockFulfillment: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<void>;
    loadOrder: (
      businessId: string,
      orderId: string,
    ) => Promise<StoredOrderAggregate | null>;
    customerExists: (businessId: string, userId: string) => Promise<boolean>;
    applyOrderCorrection: (input: {
      current: StoredOrderAggregate;
      changes: CorrectOrderCommand['changes'];
      nextFulfillment: StoredOrderAggregate['fulfillment'];
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type CorrectOrderRepository =
  OrderTransactionPort<CorrectOrderOperations>;
