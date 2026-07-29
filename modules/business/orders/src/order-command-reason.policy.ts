import type {
  CancelOrderReasonCode,
  CompleteOrderReasonCode,
  CorrectOrderReasonCode,
  CreateOrderReasonCode,
  ReleaseFulfillmentReasonCode,
  WithdrawFulfillmentReasonCode,
} from './orders.port.ts';

export const createOrderReasonCodes = [
  'new_customer_order',
  'recovery_entry',
] as const satisfies readonly CreateOrderReasonCode[];

export const correctOrderReasonCodes = [
  'customer_correction',
  'manager_correction',
  'source_discrepancy',
] as const satisfies readonly CorrectOrderReasonCode[];

export const completeOrderReasonCodes = [
  'service_completed',
  'manager_correction',
] as const satisfies readonly CompleteOrderReasonCode[];

export const cancelOrderReasonCodes = [
  'customer_canceled',
  'duplicate_order',
  'created_in_error',
  'manager_correction',
] as const satisfies readonly CancelOrderReasonCode[];

export const releaseFulfillmentReasonCodes = [
  'ready_for_production',
  'manager_override',
] as const satisfies readonly ReleaseFulfillmentReasonCode[];

export const withdrawFulfillmentReasonCodes = [
  'commercial_canceled',
  'production_hold',
  'manager_override',
] as const satisfies readonly WithdrawFulfillmentReasonCode[];

const noteRequiredReasonCodes = new Set<string>([
  'recovery_entry',
  'manager_correction',
  'source_discrepancy',
  'manager_override',
  'production_hold',
]);

export const isOrderCommandReasonValid = <ReasonCode extends string>(input: {
  reasonCode: string;
  reasonNote: string | null;
  allowedReasonCodes: readonly ReasonCode[];
}): input is {
  reasonCode: ReasonCode;
  reasonNote: string | null;
  allowedReasonCodes: readonly ReasonCode[];
} => {
  const note = input.reasonNote?.trim() ?? null;
  return (
    input.allowedReasonCodes.some((code) => code === input.reasonCode) &&
    (note === null || (note.length > 0 && note.length <= 1_000)) &&
    (!noteRequiredReasonCodes.has(input.reasonCode) || note !== null)
  );
};
