import type { Result, UnitOfWork } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { OrderState } from '../../../foundations/language/order/order.model.ts';
import type { OrderAggregate } from '../../../foundations/language/order/order.entity.ts';
import type { OrderCommandOperations } from '../../../foundations/ports/order-command-store/order-command-store.port.ts';
import type { ChangeOrderLifecycleFailure } from './change-order-lifecycle.failure.ts';

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
) => Promise<Result<OrderMutationResult, ChangeOrderLifecycleFailure>>;

export type CancelOrderCommand = OrderLifecycleCommand<CancelOrderReasonCode>;
export type CancelOrder = (
  command: CancelOrderCommand,
) => Promise<Result<OrderMutationResult, ChangeOrderLifecycleFailure>>;

export type ChangeOrderLifecycleOperations = OrderCommandOperations &
  Readonly<{
    lockOrder: (businessId: string, orderId: string) => Promise<void>;
    loadOrder: (
      businessId: string,
      orderId: string,
    ) => Promise<OrderAggregate | null>;
    applyOrderLifecycle: (input: {
      current: OrderAggregate;
      target: Exclude<OrderState, 'open'>;
      nextOrderVersion: number;
      now: Date;
    }) => Promise<void>;
  }>;

export type ChangeOrderLifecycleRepository =
  UnitOfWork<ChangeOrderLifecycleOperations>;
