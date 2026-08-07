import {
  canonicalJson,
  decodeBase64UrlJson,
  encodeBase64UrlText,
  isJsonObject,
} from '@pressly/codec';
import type { OrderState } from '../../../foundations/language/order/order.model.ts';

export type OrderCursor = Readonly<{ dueAt: Date; id: string }>;

type OrderCursorFilter = Readonly<{
  businessId: string;
  locationIds: readonly string[];
  query: string | null;
  state: OrderState | null;
}>;

const orderCursorFilterKey = (input: OrderCursorFilter): string =>
  canonicalJson({
    businessId: input.businessId,
    locationIds: [...input.locationIds].sort(),
    query: input.query?.trim().toLocaleLowerCase() ?? null,
    state: input.state,
  });

export const encodeOrderCursor = (
  filter: OrderCursorFilter,
  cursor: OrderCursor,
): string =>
  encodeBase64UrlText(
    canonicalJson({
      version: 1,
      filter: orderCursorFilterKey(filter),
      dueAt: cursor.dueAt.toISOString(),
      id: cursor.id,
    }),
  );

export const decodeOrderCursor = (
  filter: OrderCursorFilter,
  cursor: string,
): OrderCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(parsed) ||
    parsed['version'] !== 1 ||
    parsed['filter'] !== orderCursorFilterKey(filter) ||
    typeof parsed['dueAt'] !== 'string' ||
    typeof parsed['id'] !== 'string'
  )
    return null;

  const dueAt = new Date(parsed['dueAt']);
  return Number.isNaN(dueAt.getTime()) ? null : { dueAt, id: parsed['id'] };
};
