import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, desc, eq, inArray, lt, or, sql } from '@pressly/postgres/query';
import {
  encodeOrderCursor,
  projectCanonicalOrderSummary,
} from '../../../model/canonical-order/policy.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { ListCanonicalOrdersRepository } from './types.ts';

export const makeListCanonicalOrdersPostgresRepository = (dependencies: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderFulfillments' | 'orders'>;
}): ListCanonicalOrdersRepository => ({
  list: ({ query, cursor }) =>
    dependencies.db.transaction(async (transaction) => {
      const orders = dependencies.schema;
      const rows = await transaction
        .select({
          order: orders.orders,
          fulfillment: orders.orderFulfillments,
          customer: {
            firstName: orders.orders.customerFirstName,
            lastName: orders.orders.customerLastName,
            businessName: orders.orders.customerBusinessName,
            phone: orders.orders.customerPhone,
            email: orders.orders.customerEmail,
          },
        })
        .from(orders.orders)
        .innerJoin(
          orders.orderFulfillments,
          and(
            eq(orders.orderFulfillments.businessId, orders.orders.businessId),
            eq(orders.orderFulfillments.orderId, orders.orders.id),
          ),
        )
        .where(
          and(
            eq(orders.orders.businessId, query.businessId),
            inArray(orders.orderFulfillments.locationId, query.locationIds),
            query.state === null
              ? undefined
              : eq(orders.orders.state, query.state),
            query.query === null
              ? undefined
              : sql`lower(concat_ws(' ', ${orders.orders.displayNumber}, ${orders.orders.customerFirstName}, ${orders.orders.customerLastName}, ${orders.orders.customerBusinessName}, ${orders.orders.customerPhone}, ${orders.orders.customerEmail})) like ${`%${query.query.toLocaleLowerCase()}%`}`,
            cursor === null
              ? undefined
              : or(
                  lt(orders.orders.dueAt, cursor.dueAt),
                  and(
                    eq(orders.orders.dueAt, cursor.dueAt),
                    lt(orders.orders.id, cursor.id),
                  ),
                ),
          ),
        )
        .orderBy(desc(orders.orders.dueAt), desc(orders.orders.id))
        .limit(query.limit + 1);
      const visible = rows.slice(0, query.limit);
      const last = visible.at(-1);
      return {
        items: visible.map((row) => projectCanonicalOrderSummary(row)),
        nextCursor:
          rows.length > query.limit && last !== undefined
            ? encodeOrderCursor(query, {
                dueAt: last.order.dueAt,
                id: last.order.id,
              })
            : null,
      };
    }),
});
