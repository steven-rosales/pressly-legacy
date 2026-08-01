import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../order-transaction.port.ts';
import type { OrderInput, OrderMutationResult } from '../orders.port.ts';

export type CreateOrderOperations = OrderCommandOperations &
  Readonly<{
    validateReferences: (input: {
      businessId: string;
      locationId: string;
      customerUserId: string | null;
    }) => Promise<boolean>;
    createOrder: (input: {
      businessId: string;
      order: OrderInput;
      now: Date;
    }) => Promise<OrderMutationResult>;
  }>;

export type CreateOrderRepository = OrderTransactionPort<CreateOrderOperations>;
