import { type Database } from '@pressly/db/client';
import { and, count, desc, eq, inArray, lt, or, sql } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/users';
import { projectUserSummary } from '../../../foundations/language/user-summary/user-summary.projection.ts';
import type { ListUsersRepository } from './list-users.port.ts';
import {
  decodeUserCursor,
  encodeUserCursor,
} from './user-pagination.policy.ts';

export const makePostgresListUsersRepository =
  (db: Database): ListUsersRepository =>
  async (query) => {
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
          projectUserSummary(row, duplicateCounts.get(row.id) ?? 0),
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
  };
