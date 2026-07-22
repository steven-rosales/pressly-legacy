import type { OrderInput } from './orders.port.ts';

export const isOrderInputValid = (input: OrderInput): boolean => {
  if (
    Number.isNaN(input.dueAt.getTime()) ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    input.totalAmountCents < 0 ||
    (input.balanceDueCents !== null && input.balanceDueCents < 0) ||
    input.fulfillment.typeCode.trim() === '' ||
    input.fulfillment.locationId.trim() === '' ||
    (input.fulfillment.bagCount !== null && input.fulfillment.bagCount < 0) ||
    (input.fulfillment.estimatedWeightLbs === null) !==
      (input.fulfillment.estimatedWeightSource === null) ||
    (input.fulfillment.estimatedWeightLbs !== null &&
      input.fulfillment.estimatedWeightLbs <= 0)
  )
    return false;

  const lineKeys = new Set<string>();
  for (const item of input.items) {
    if (
      item.lineKey.trim() === '' ||
      item.code.trim() === '' ||
      item.description.trim() === '' ||
      item.unit.trim() === '' ||
      item.quantity < 0 ||
      item.unitPriceCents < 0 ||
      item.totalAmountCents < 0 ||
      lineKeys.has(item.lineKey)
    )
      return false;
    lineKeys.add(item.lineKey);
  }
  return true;
};
