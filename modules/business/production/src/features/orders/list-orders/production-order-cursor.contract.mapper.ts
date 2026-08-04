import { productionIdSchema } from '@pressly/contracts/production';
import { decodeBase64UrlText, encodeBase64UrlText } from '@pressly/codec';

export const encodeProductionOrderCursor = (orderId: string): string => {
  productionIdSchema.parse(orderId);
  return encodeBase64UrlText(orderId);
};

export const decodeProductionOrderCursor = (cursor: string): string | null => {
  const decoded = decodeBase64UrlText(cursor);
  return decoded !== null && productionIdSchema.safeParse(decoded).success
    ? decoded
    : null;
};
