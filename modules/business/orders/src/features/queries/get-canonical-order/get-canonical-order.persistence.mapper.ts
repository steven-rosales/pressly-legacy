import { isJsonObject } from '@pressly/codec';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type { OrderItemInput } from '../../../foundations/language/order/order.model.ts';

export const canonicalOrderItemFromRow = (row: {
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: unknown;
}): OrderItemInput => {
  if (!isJsonObject(row.sourceMetadata))
    throw orderInvariantError(
      'ORDER_ITEM_SOURCE_METADATA_INVALID',
      'Stored Order item source metadata is not a JSON object.',
    );

  return { ...row, sourceMetadata: row.sourceMetadata };
};
