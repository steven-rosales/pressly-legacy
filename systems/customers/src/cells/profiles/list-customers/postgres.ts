import type { PostgresDatabase } from '@pressly/postgres/client';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
} from '@pressly/postgres/query';
import { projectCustomerSummary } from '../../../model/customer.ts';
import type { CustomersSchema } from '../../../schema/customers.ts';
import { decodeCustomerCursor, encodeCustomerCursor } from './cursor.ts';
import type { ListCustomersRepository } from './types.ts';

export const makeListCustomersPostgresRepository = (
  database: PostgresDatabase,
  customers: Pick<CustomersSchema, 'userDuplicateCandidates' | 'users'>,
): ListCustomersRepository =>
  async function listCustomers(query) {
    const cursor =
      query.cursor === null ? null : decodeCustomerCursor(query, query.cursor);
    if (query.cursor !== null && cursor === null)
      return { kind: 'invalid_cursor' };

    const normalizedQuery = query.query?.toLocaleLowerCase() ?? null;
    const rows = await database
      .select()
      .from(customers.users)
      .where(
        and(
          eq(customers.users.businessId, query.businessId),
          query.active === null
            ? undefined
            : eq(customers.users.active, query.active),
          normalizedQuery === null
            ? undefined
            : sql`lower(concat_ws(' ', ${customers.users.firstName}, ${customers.users.lastName}, ${customers.users.businessName}, ${customers.users.phone}, ${customers.users.email})) like ${`%${normalizedQuery}%`}`,
          cursor === null
            ? undefined
            : or(
                lt(customers.users.createdAt, cursor.createdAt),
                and(
                  eq(customers.users.createdAt, cursor.createdAt),
                  lt(customers.users.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(desc(customers.users.createdAt), desc(customers.users.id))
      .limit(query.limit + 1);

    const visible = rows.slice(0, query.limit);
    const duplicateCounts =
      visible.length === 0
        ? new Map<string, number>()
        : new Map(
            (
              await database
                .select({
                  userId: customers.userDuplicateCandidates.userId,
                  value: count(),
                })
                .from(customers.userDuplicateCandidates)
                .where(
                  and(
                    inArray(
                      customers.userDuplicateCandidates.userId,
                      visible.map((row) => row.id),
                    ),
                    eq(customers.userDuplicateCandidates.status, 'open'),
                  ),
                )
                .groupBy(customers.userDuplicateCandidates.userId)
            ).map((row) => [row.userId, Number(row.value)]),
          );
    const last = visible.at(-1);

    return {
      kind: 'ok',
      value: {
        items: visible.map((row) =>
          projectCustomerSummary(row, duplicateCounts.get(row.id) ?? 0),
        ),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeCustomerCursor(query, {
                createdAt: last.createdAt,
                id: last.id,
              })
            : null,
      },
    };
  };
