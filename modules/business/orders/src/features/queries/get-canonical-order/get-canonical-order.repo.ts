import { type Database } from '@pressly/db/client';
import { and, eq, inArray } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import * as userSchema from '@pressly/db/schema/users';
import { projectCanonicalOrderSummary } from '../../../foundations/language/canonical-order-read/canonical-order-read.projection.ts';
import { canonicalOrderItemFromRow } from './get-canonical-order.persistence.mapper.ts';
import type { GetCanonicalOrderRepository } from './get-canonical-order.port.ts';

export const makePostgresGetCanonicalOrderRepository =
  (db: Database): GetCanonicalOrderRepository =>
  async (query) => {
    if (query.locationIds.length === 0) return null;
    const [row] = await db
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
      )
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

    return {
      ...projectCanonicalOrderSummary(row),
      items: itemRows.map(canonicalOrderItemFromRow),
    };
  };
