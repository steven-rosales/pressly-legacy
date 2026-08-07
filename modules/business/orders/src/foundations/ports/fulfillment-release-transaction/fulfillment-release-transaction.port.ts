import type { UnitOfWork } from '@pressly/kernel';
import type { OrderAggregate } from '../../language/order/order.entity.ts';
import type { FulfillmentReleaseState } from '../../language/order/order.model.ts';
import type { OrderCommandOperations } from '../order-command-store/order-command-store.port.ts';

export type FulfillmentReleaseTransactionOperations = OrderCommandOperations &
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
    ) => Promise<OrderAggregate | null>;
    applyFulfillmentRelease: (input: {
      current: OrderAggregate;
      target: FulfillmentReleaseState;
      nextOrderVersion: number;
      nextFulfillmentVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type FulfillmentReleaseTransaction =
  UnitOfWork<FulfillmentReleaseTransactionOperations>;
