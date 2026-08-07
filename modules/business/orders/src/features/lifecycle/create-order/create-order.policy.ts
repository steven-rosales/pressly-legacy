import type { CreateOrderReasonCode } from './create-order.port.ts';

export const createOrderReasonCodes = [
  'new_customer_order',
  'recovery_entry',
] as const satisfies readonly CreateOrderReasonCode[];
