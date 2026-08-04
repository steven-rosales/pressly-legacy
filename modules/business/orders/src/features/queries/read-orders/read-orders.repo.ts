import { type Database } from '@pressly/db/client';
import { and, desc, eq, inArray, lt, or, sql } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import * as userSchema from '@pressly/db/schema/users';
import {
  decodeOrderCursor,
  encodeOrderCursor,
} from './order-pagination.policy.ts';
import type {
  CanonicalOrderDetail,
  ReadOrdersRepository,
} from './read-orders.port.ts';
import {
  canonicalOrderItemFromRow,
  canonicalOrderSummaryFromRows,
} from './read-orders.persistence.mapper.ts';

const baseQuery = (db: Database) =>
  db
    .select({
      order: schema.orders,
      fulfillment: schema.orderFulfillments,
      customer: userSchema.users,
    })
    .from(schema.orders)
    .innerJoin(
      schema.orderFulfillments,
      and(
        eq(schema.orderFulfillments.businessId, schema.orders.businessId),
        eq(schema.orderFulfillments.orderId, schema.orders.id),
      ),
    )
    .leftJoin(
      userSchema.users,
      and(
        eq(userSchema.users.businessId, schema.orders.businessId),
        eq(userSchema.users.id, schema.orders.customerUserId),
      ),
    );

export const makePostgresReadOrdersRepository = (
  db: Database,
): ReadOrdersRepository => ({
  list: async (query) => {
    const cursor =
      query.cursor === null ? null : decodeOrderCursor(query, query.cursor);
    if (query.cursor !== null && cursor === null)
      return { kind: 'invalid_cursor' };
    if (query.locationIds.length === 0)
      return {
        kind: 'ok',
        value: { items: [], nextCursor: null },
      };
    const normalizedQuery = query.query?.toLocaleLowerCase() ?? null;
    const rows = await baseQuery(db)
      .where(
        and(
          eq(schema.orders.businessId, query.businessId),
          inArray(schema.orderFulfillments.locationId, query.locationIds),
          query.state === null
            ? undefined
            : eq(schema.orders.state, query.state),
          normalizedQuery === null
            ? undefined
            : sql`lower(concat_ws(' ', ${schema.orders.displayNumber}, ${userSchema.users.firstName}, ${userSchema.users.lastName}, ${userSchema.users.businessName}, ${userSchema.users.phone}, ${userSchema.users.email})) like ${`%${normalizedQuery}%`}`,
          cursor === null
            ? undefined
            : or(
                lt(schema.orders.dueAt, cursor.dueAt),
                and(
                  eq(schema.orders.dueAt, cursor.dueAt),
                  lt(schema.orders.id, cursor.id),
                ),
              ),
        ),
      )
      .orderBy(desc(schema.orders.dueAt), desc(schema.orders.id))
      .limit(query.limit + 1);
    const visible = rows.slice(0, query.limit);
    const last = visible.at(-1);
    return {
      kind: 'ok',
      value: {
        items: visible.map(canonicalOrderSummaryFromRows),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeOrderCursor(query, {
                dueAt: last.order.dueAt,
                id: last.order.id,
              })
            : null,
      },
    };
  },
  get: async (query) => {
    if (query.locationIds.length === 0) return null;
    const [row] = await baseQuery(db)
      .where(
        and(
          eq(schema.orders.businessId, query.businessId),
          eq(schema.orders.id, query.orderId),
          inArray(schema.orderFulfillments.locationId, query.locationIds),
        ),
      )
      .limit(1);
    if (row === undefined) return null;
    const itemRows = await db
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.businessId, query.businessId),
          eq(schema.orderItems.orderId, query.orderId),
        ),
      )
      .orderBy(schema.orderItems.createdAt, schema.orderItems.id);
    const items = itemRows.map(canonicalOrderItemFromRow);
    return {
      ...canonicalOrderSummaryFromRows(row),
      items,
    } satisfies CanonicalOrderDetail;
  },
});
