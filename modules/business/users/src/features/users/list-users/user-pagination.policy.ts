import {
  canonicalJson,
  decodeBase64UrlJson,
  encodeBase64UrlText,
  isJsonObject,
} from '@pressly/codec';

export type UserCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

type UserCursorFilter = Readonly<{
  businessId: string;
  query: string | null;
  active: boolean | null;
}>;

const userCursorFilterKey = (input: UserCursorFilter): string =>
  canonicalJson({
    businessId: input.businessId,
    query: input.query?.trim().toLocaleLowerCase() ?? null,
    active: input.active,
  });

export const encodeUserCursor = (
  filter: UserCursorFilter,
  cursor: UserCursor,
): string =>
  encodeBase64UrlText(
    canonicalJson({
      version: 1,
      filter: userCursorFilterKey(filter),
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
  );

export const decodeUserCursor = (
  filter: UserCursorFilter,
  cursor: string,
): UserCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(parsed) ||
    parsed['version'] !== 1 ||
    parsed['filter'] !== userCursorFilterKey(filter) ||
    typeof parsed['createdAt'] !== 'string' ||
    typeof parsed['id'] !== 'string'
  )
    return null;

  const createdAt = new Date(parsed['createdAt']);
  return Number.isNaN(createdAt.getTime())
    ? null
    : { createdAt, id: parsed['id'] };
};
