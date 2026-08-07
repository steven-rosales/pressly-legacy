import type { WithdrawFulfillmentReasonCode } from './withdraw-fulfillment.port.ts';

export const withdrawFulfillmentReasonCodes = [
  'commercial_canceled',
  'production_hold',
  'manager_override',
] as const satisfies readonly WithdrawFulfillmentReasonCode[];
