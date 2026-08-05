import type { CancelOrderReasonCode } from './cancel-order.port.ts';

export const cancelOrderReasonCodes = [
  'customer_canceled',
  'duplicate_order',
  'created_in_error',
  'manager_correction',
] as const satisfies readonly CancelOrderReasonCode[];
