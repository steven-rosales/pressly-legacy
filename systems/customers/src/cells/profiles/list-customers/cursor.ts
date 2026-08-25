import {
  canonicalJson,
  decodeBase64UrlJson,
  encodeBase64UrlText,
  isJsonObject,
} from '@pressly/codec';
import type { ListCustomersQuery } from './types.ts';

export type CustomerCursor = Readonly<{ createdAt: Date; id: string }>;

type CustomerCursorFilter = Pick<
  ListCustomersQuery,
  'businessId' | 'query' | 'active'
>;

const customerCursorFilterKey = (input: CustomerCursorFilter): string =>
  canonicalJson({
    businessId: input.businessId,
    query: input.query?.trim().toLocaleLowerCase() ?? null,
    active: input.active,
  });

export const encodeCustomerCursor = (
  filter: CustomerCursorFilter,
  cursor: CustomerCursor,
): string =>
  encodeBase64UrlText(
    canonicalJson({
      version: 1,
      filter: customerCursorFilterKey(filter),
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  );

export const decodeCustomerCursor = (
  filter: CustomerCursorFilter,
  cursor: string,
): CustomerCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(parsed) ||
    parsed['version'] !== 1 ||
    parsed['filter'] !== customerCursorFilterKey(filter) ||
    typeof parsed['createdAt'] !== 'string' ||
    typeof parsed['id'] !== 'string'
  )
    return null;

  const createdAt = new Date(parsed['createdAt']);
  return Number.isNaN(createdAt.getTime())
    ? null
    : { createdAt, id: parsed['id'] };
};
