import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { OrderInput, OrderMutationResult } from '../orders.port.ts';

export type CreateOrderOperations = OrderCommandOperations &
  Readonly<{
    createOrder: (input: {
      order: OrderInput;
      authorityFields: readonly string[];
      now: Date;
    }) => Promise<OrderMutationResult>;
  }>;

export type CreateOrderRepository = OrderTransactionPort<CreateOrderOperations>;
