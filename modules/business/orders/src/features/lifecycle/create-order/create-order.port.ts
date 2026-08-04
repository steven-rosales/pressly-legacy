import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type {
  DirectOrderInput,
  OrderInput,
} from '../../../foundations/language/order/order.model.ts';
import type { OrderCommandOperations } from '../../../foundations/ports/order-command-store/order-command-store.port.ts';
import type { CreateOrderFailure } from './create-order.failure.ts';

export type CreateOrderReasonCode = 'new_customer_order' | 'recovery_entry';

export type CreateOrderCommand = DirectOrderInput &
  AuditedOrderCommand<CreateOrderReasonCode>;

export type CreateOrder = (
  command: CreateOrderCommand,
) => Promise<Result<OrderMutationResult, CreateOrderFailure>>;

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

export type CreateOrderRepository = UnitOfWork<CreateOrderOperations>;
