import type { ReleaseFulfillmentReasonCode } from './release-fulfillment.port.ts';

export const releaseFulfillmentReasonCodes = [
  'ready_for_production',
  'manager_override',
] as const satisfies readonly ReleaseFulfillmentReasonCode[];
