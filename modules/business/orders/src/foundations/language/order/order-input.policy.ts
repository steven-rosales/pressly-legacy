import { isJsonObject } from '@pressly/codec';
import type { OrderInput, OrderItemInput } from './order.model.ts';

export const isEstimatedWeightValid = (input: {
  lbs: number | null;
  source: string | null;
}): boolean =>
  (input.lbs === null) === (input.source === null) &&
  (input.lbs === null || (Number.isFinite(input.lbs) && input.lbs > 0)) &&
  (input.source === null || input.source.trim() !== '');

export const areOrderItemsValid = (
  items: readonly OrderItemInput[],
): boolean => {
  const lineKeys = new Set<string>();
  for (const item of items) {
    if (
      item.lineKey.trim() === '' ||
      item.itemType.trim() === '' ||
      item.code.trim() === '' ||
      item.description.trim() === '' ||
      item.unit.trim() === '' ||
      !Number.isFinite(item.quantity) ||
      item.quantity < 0 ||
      !Number.isInteger(item.unitPriceCents) ||
      item.unitPriceCents < 0 ||
      !Number.isInteger(item.totalAmountCents) ||
      item.totalAmountCents < 0 ||
      !isJsonObject(item.sourceMetadata) ||
      lineKeys.has(item.lineKey)
    )
      return false;
    lineKeys.add(item.lineKey);
  }
  return true;
};

export const isOrderInputValid = (input: OrderInput): boolean => {
  if (
    Number.isNaN(input.dueAt.getTime()) ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !Number.isInteger(input.totalAmountCents) ||
    input.totalAmountCents < 0 ||
    (input.balanceDueCents !== null &&
      (!Number.isInteger(input.balanceDueCents) ||
        input.balanceDueCents < 0)) ||
    input.fulfillment.typeCode.trim() === '' ||
    input.fulfillment.locationId.trim() === '' ||
    (input.fulfillment.bagCount !== null &&
      (!Number.isInteger(input.fulfillment.bagCount) ||
        input.fulfillment.bagCount < 0)) ||
    !isEstimatedWeightValid({
      lbs: input.fulfillment.estimatedWeightLbs,
      source: input.fulfillment.estimatedWeightSource,
    })
  )
    return false;

  return areOrderItemsValid(input.items);
};
