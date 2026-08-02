import { productionIdSchema } from '@pressly/contracts';

export const encodeProductionOrderCursor = (orderId: string): string => {
  productionIdSchema.parse(orderId);
  return Buffer.from(orderId, 'utf8').toString('base64url');
};

export const decodeProductionOrderCursor = (cursor: string): string | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return productionIdSchema.safeParse(decoded).success ? decoded : null;
  } catch {
    return null;
  }
};
