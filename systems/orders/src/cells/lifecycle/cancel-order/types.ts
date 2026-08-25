import type { CommandContext } from '@pressly/cells/command-context';

export const cancelOrderOperationId = 'orders.cancel-order.v1' as const;
export type CancelOrderReasonCode =
  | 'customer_canceled'
  | 'duplicate_order'
  | 'created_in_error'
  | 'manager_correction';
export type CancelOrderCommand = Readonly<{
  businessId: string;
  locationId: string;
  orderId: string;
  expectedVersion: number;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: CancelOrderReasonCode;
  reasonNote: string | null;
}>;
export type CancelOrderExpectedFailure =
  | Readonly<{
      kind: 'validation';
      code: 'order_lifecycle_command_invalid';
      message: string;
    }>
  | Readonly<{
      kind: 'not_found';
      code: 'order_not_found';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'order_version_conflict'
        | 'order_transition_invalid'
        | 'order_idempotency_conflict';
      message: string;
    }>;
