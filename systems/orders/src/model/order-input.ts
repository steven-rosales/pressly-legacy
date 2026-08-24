import { isJsonObject, type JsonObject } from '@pressly/codec';

export type OrderItemInput = Readonly<{
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: JsonObject;
}>;

export type DirectFulfillmentInput = Readonly<{
  typeCode: string;
  locationId: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
}>;

export type OrderInput = Readonly<{
  displayNumber: string | null;
  state: 'open';
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: DirectFulfillmentInput &
    Readonly<{
      releaseState: 'unreleased';
    }>;
}>;

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
    !isEstimatedWeightValid({
      lbs: input.fulfillment.estimatedWeightLbs,
      source: input.fulfillment.estimatedWeightSource,
    })
  )
    return false;

  return areOrderItemsValid(input.items);
};
