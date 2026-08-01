import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { OrderState } from '../orders.port.ts';

export type ChangeOrderLifecycleOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    loadOrder: (
      businessId: string,
      orderId: string,
    ) => Promise<StoredOrderAggregate | null>;
    applyOrderLifecycle: (input: {
      current: StoredOrderAggregate;
      target: Exclude<OrderState, 'open'>;
      nextOrderVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeOrderLifecycleRepository =
  OrderTransactionPort<ChangeOrderLifecycleOperations>;
