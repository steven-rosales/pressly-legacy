import type { Result } from '@pressly/kernel';
import type {
  AuditedOrderCommand,
  OrderMutationResult,
} from '../../../foundations/language/command-execution/order-command.model.ts';
import type { OrderLifecycleFailure } from '../../../foundations/language/order-lifecycle/order-lifecycle.failure.ts';

export type CompleteOrderReasonCode =
  | 'service_completed'
  | 'manager_correction';

export type CompleteOrderCommand =
  AuditedOrderCommand<CompleteOrderReasonCode> &
    Readonly<{
      locationId: string;
      orderId: string;
      expectedVersion: number;
    }>;

export type CompleteOrder = (
  command: CompleteOrderCommand,
) => Promise<Result<OrderMutationResult, OrderLifecycleFailure>>;
