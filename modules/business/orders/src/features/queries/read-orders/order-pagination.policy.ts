import {
  canonicalJson,
  decodeBase64UrlJson,
  encodeBase64UrlText,
  isJsonObject,
} from '@pressly/codec';
import type { ListCanonicalOrdersQuery } from './read-orders.port.ts';

export type OrderCursor = Readonly<{ dueAt: Date; id: string }>;

const filterKey = (
  query: Omit<ListCanonicalOrdersQuery, 'limit' | 'cursor'>,
): string =>
  canonicalJson({
    businessId: query.businessId,
    locationIds: [...query.locationIds].sort(),
    query: query.query?.trim().toLocaleLowerCase() ?? null,
    state: query.state,
  });

export const encodeOrderCursor = (
  query: Omit<ListCanonicalOrdersQuery, 'limit' | 'cursor'>,
  cursor: OrderCursor,
): string =>
  encodeBase64UrlText(
    canonicalJson({
      version: 1,
      filter: filterKey(query),
      dueAt: cursor.dueAt.toISOString(),
      id: cursor.id,
    }),
  );

export const decodeOrderCursor = (
  query: Omit<ListCanonicalOrdersQuery, 'limit' | 'cursor'>,
  cursor: string,
): OrderCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(parsed) ||
    parsed['version'] !== 1 ||
    parsed['filter'] !== filterKey(query) ||
    typeof parsed['dueAt'] !== 'string' ||
    typeof parsed['id'] !== 'string'
  )
    return null;
  const dueAt = new Date(parsed['dueAt']);
  return Number.isNaN(dueAt.getTime()) ? null : { dueAt, id: parsed['id'] };
};
