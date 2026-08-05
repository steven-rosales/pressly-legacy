import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { OrderLifecycleFailure } from '../../../foundations/language/order-lifecycle/order-lifecycle.failure.ts';

export type CancelOrderReasonCode =
  | 'customer_canceled'
  | 'duplicate_order'
  | 'created_in_error'
  | 'manager_correction';

export type CancelOrderCommand = AuditedOrderCommand<CancelOrderReasonCode> &
  Readonly<{
    locationId: string;
    orderId: string;
    expectedVersion: number;
  }>;

export type CancelOrder = (
  command: CancelOrderCommand,
) => Promise<Result<OrderMutationResult, OrderLifecycleFailure>>;
