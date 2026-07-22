import type { StoredOrderAggregate } from '../order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { UpdateOrderCommand } from '../orders.port.ts';

export type UpdateOrderOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (orderId: string) => Promise<void>;
    loadOrder: (orderId: string) => Promise<StoredOrderAggregate | null>;
    applyOrderUpdate: (input: {
      current: StoredOrderAggregate;
      changes: UpdateOrderCommand['changes'];
      targetState: StoredOrderAggregate['order']['state'];
      authorityFields: readonly string[];
      nextOrderVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type UpdateOrderRepository = OrderTransactionPort<UpdateOrderOperations>;
