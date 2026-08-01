import {
  and,
  count,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
  users as schema,
  type Database,
} from '@pressly/db';
import {
  decodeUserCursor,
  encodeUserCursor,
} from '../user-pagination.policy.ts';
import type { UserSummary } from '../users.port.ts';
import type { ReadUsersRepository } from './read-users.port.ts';

const displayName = (row: {
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
}): string => {
  const business = row.businessName?.trim();
  if (business !== undefined && business !== '') return business;
  const person = [row.firstName, row.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return person === '' ? 'Unnamed customer' : person;
};

const makeSummary = (
  row: typeof schema.users.$inferSelect,
  possibleDuplicateCount: number,
): UserSummary => ({
  id: row.id,
  businessId: row.businessId,
  version: row.version,
  active: row.active,
  firstName: row.firstName,
  lastName: row.lastName,
  businessName: row.businessName,
  phone: row.phone,
  email: row.email,
  displayName: displayName(row),
  possibleDuplicateCount,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const makePostgresReadUsersRepository = (
  db: Database,
): ReadUsersRepository => ({
  list: async (query) => {
    const cursor =
      query.cursor === null ? null : decodeUserCursor(query, query.cursor);
    if (query.cursor !== null && cursor === null)
      return { kind: 'invalid_cursor' };

    const normalizedQuery = query.query?.toLocaleLowerCase() ?? null;
    const rows = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, query.businessId),
          query.active === null
            ? undefined
            : eq(schema.users.active, query.active),
          normalizedQuery === null
            ? undefined
            : sql`lower(concat_ws(' ', ${schema.users.firstName}, ${schema.users.lastName}, ${schema.users.businessName}, ${schema.users.phone}, ${schema.users.email})) like ${`%${normalizedQuery}%`}`,
          cursor === null
            ? undefined
            : or(
                lt(schema.users.createdAt, cursor.createdAt),
                and(
                  eq(schema.users.createdAt, cursor.createdAt),
                  lt(schema.users.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(desc(schema.users.createdAt), desc(schema.users.id))
      .limit(query.limit + 1);

    const visible = rows.slice(0, query.limit);
    const duplicateCounts =
      visible.length === 0
        ? new Map<string, number>()
        : new Map(
            (
              await db
                .select({
                  userId: schema.userDuplicateCandidates.userId,
                  value: count(),
                })
                .from(schema.userDuplicateCandidates)
                .where(
                  and(
                    inArray(
                      schema.userDuplicateCandidates.userId,
                      visible.map((row) => row.id),
                    ),
                    eq(schema.userDuplicateCandidates.status, 'open'),
                  ),
                )
                .groupBy(schema.userDuplicateCandidates.userId)
            ).map((row) => [row.userId, Number(row.value)]),
          );
    const last = visible.at(-1);
    return {
      kind: 'ok',
      value: {
        items: visible.map((row) =>
          makeSummary(row, duplicateCounts.get(row.id) ?? 0),
        ),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeUserCursor(query, {
                createdAt: last.createdAt,
                id: last.id,
              })
            : null,
      },
    };
  },
  get: async (query) => {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(
        and(
          eq(schema.users.businessId, query.businessId),
          eq(schema.users.id, query.userId),
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    const [duplicate] = await db
      .select({ value: count() })
      .from(schema.userDuplicateCandidates)
      .where(
        and(
          eq(schema.userDuplicateCandidates.userId, row.id),
          eq(schema.userDuplicateCandidates.status, 'open'),
        ),
      );
    return makeSummary(row, Number(duplicate?.value ?? 0));
  },
});
