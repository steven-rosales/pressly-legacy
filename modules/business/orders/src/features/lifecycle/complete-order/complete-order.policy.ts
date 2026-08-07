import type { CompleteOrderReasonCode } from './complete-order.port.ts';

export const completeOrderReasonCodes = [
  'service_completed',
  'manager_correction',
] as const satisfies readonly CompleteOrderReasonCode[];
