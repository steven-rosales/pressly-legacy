import { canonicalJson } from '@pressly/kernel';
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
  Buffer.from(
    canonicalJson({
      version: 1,
      filter: filterKey(query),
      dueAt: cursor.dueAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');

export const decodeOrderCursor = (
  query: Omit<ListCanonicalOrdersQuery, 'limit' | 'cursor'>,
  cursor: string,
): OrderCursor | null => {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as unknown;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('filter' in parsed) ||
      parsed.filter !== filterKey(query) ||
      !('dueAt' in parsed) ||
      typeof parsed.dueAt !== 'string' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string'
    )
      return null;
    const dueAt = new Date(parsed.dueAt);
    return Number.isNaN(dueAt.getTime()) ? null : { dueAt, id: parsed.id };
  } catch {
    return null;
  }
};
