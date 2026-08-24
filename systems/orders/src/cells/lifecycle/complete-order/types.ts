import type { CommandContext } from '@pressly/cells/command-context';

export const completeOrderOperationId = 'orders.complete-order.v1' as const;
export type CompleteOrderReasonCode =
  | 'service_completed'
  | 'manager_correction';
export type CompleteOrderCommand = Readonly<{
  businessId: string;
  locationId: string;
  orderId: string;
  expectedVersion: number;
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: CompleteOrderReasonCode;
  reasonNote: string | null;
}>;
export type CompleteOrderExpectedFailure =
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
