import { canonicalJson } from '@pressly/kernel';

export type UserCursor = Readonly<{
  createdAt: Date;
  id: string;
}>;

const filterKey = (input: {
  businessId: string;
  query: string | null;
  active: boolean | null;
}): string =>
  canonicalJson({
    businessId: input.businessId,
    query: input.query?.trim().toLocaleLowerCase() ?? null,
    active: input.active,
  });

export const encodeUserCursor = (
  filter: {
    businessId: string;
    query: string | null;
    active: boolean | null;
  },
  cursor: UserCursor,
): string =>
  Buffer.from(
    canonicalJson({
      version: 1,
      filter: filterKey(filter),
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    'utf8',
  ).toString('base64url');

export const decodeUserCursor = (
  filter: {
    businessId: string;
    query: string | null;
    active: boolean | null;
  },
  cursor: string,
): UserCursor | null => {
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
      parsed.filter !== filterKey(filter) ||
      !('createdAt' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string'
    )
      return null;
    const createdAt = new Date(parsed.createdAt);
    return Number.isNaN(createdAt.getTime())
      ? null
      : { createdAt, id: parsed.id };
  } catch {
    return null;
  }
};
