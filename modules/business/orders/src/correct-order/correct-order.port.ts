import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { CorrectOrderCommand } from '../orders.port.ts';

export type CorrectOrderOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (orderId: string) => Promise<void>;
    lockFulfillment: (fulfillmentId: string) => Promise<void>;
    loadOrder: (orderId: string) => Promise<StoredOrderAggregate | null>;
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
