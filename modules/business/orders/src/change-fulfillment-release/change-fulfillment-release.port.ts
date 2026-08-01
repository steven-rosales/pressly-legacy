import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { FulfillmentReleaseState } from '../orders.port.ts';

export type ChangeFulfillmentReleaseOperations = OrderCommandOperations &
  Readonly<{
    findOrderId: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<string | null>;
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    lockFulfillment: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<void>;
    loadFulfillmentOrder: (
      businessId: string,
      fulfillmentId: string,
    ) => Promise<StoredOrderAggregate | null>;
    applyFulfillmentRelease: (input: {
      current: StoredOrderAggregate;
      target: FulfillmentReleaseState;
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeFulfillmentReleaseRepository =
  OrderTransactionPort<ChangeFulfillmentReleaseOperations>;
