import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../command-execution/order-command.port.ts';
import type {
  DirectOrderInput,
  OrderInput,
} from '../order-model/order.model.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../persistence/order-transaction.port.ts';

export type CreateOrderReasonCode = 'new_customer_order' | 'recovery_entry';

export type CreateOrderCommand = DirectOrderInput &
  AuditedOrderCommand<CreateOrderReasonCode>;

export type CreateOrder = (
  command: CreateOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

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
