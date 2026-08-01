import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../command-execution/order-command.port.ts';
import type { OrderState } from '../order-model/order-model.port.ts';
import type { StoredOrderAggregate } from '../persistence/order-aggregate.port.ts';
import type {
  OrderCommandOperations,
  OrderTransactionPort,
} from '../persistence/order-transaction.port.ts';

export type CompleteOrderReasonCode =
  | 'service_completed'
  | 'manager_correction';
export type CancelOrderReasonCode =
  | 'customer_canceled'
  | 'duplicate_order'
  | 'created_in_error'
  | 'manager_correction';

type OrderLifecycleCommand<ReasonCode extends string> =
  AuditedOrderCommand<ReasonCode> &
    Readonly<{
      locationId: string;
      orderId: string;
      expectedVersion: number;
    }>;

export type CompleteOrderCommand =
  OrderLifecycleCommand<CompleteOrderReasonCode>;
export type CompleteOrder = (
  command: CompleteOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type CancelOrderCommand = OrderLifecycleCommand<CancelOrderReasonCode>;
export type CancelOrder = (
  command: CancelOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

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
