import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { FulfillmentReleaseState } from '../orders.port.ts';

export type ChangeFulfillmentReleaseOperations = OrderCommandOperations &
  Readonly<{
    lockFulfillment: (fulfillmentId: string) => Promise<void>;
    loadFulfillmentOrder: (
      fulfillmentId: string,
    ) => Promise<StoredOrderAggregate | null>;
    applyFulfillmentRelease: (input: {
      current: StoredOrderAggregate;
      target: FulfillmentReleaseState;
      authorityField: string;
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeFulfillmentReleaseRepository =
  OrderTransactionPort<ChangeFulfillmentReleaseOperations>;
