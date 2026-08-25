import { isJsonObject } from '@pressly/codec';
import { invariantViolationError } from '@pressly/errors/factories';
import type { PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, inArray } from '@pressly/postgres/query';
import { projectCanonicalOrderSummary } from '../../../model/canonical-order/policy.ts';
import type { OrderItemInput } from '../../../model/order-input.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import type { GetCanonicalOrderRepository } from './types.ts';

const itemFromRow = (row: {
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: unknown;
}): OrderItemInput => {
  if (!isJsonObject(row.sourceMetadata))
    throw invariantViolationError({
      code: 'order_item_source_metadata_invalid',
      message: 'Stored Order item source metadata is not a JSON object.',
      safeMessage: 'Stored order data is inconsistent.',
    });
  return { ...row, sourceMetadata: row.sourceMetadata };
};

export const makeGetCanonicalOrderPostgresRepository = (dependencies: {
  db: PostgresDatabase;
  schema: Pick<OrdersSchema, 'orderFulfillments' | 'orderItems' | 'orders'>;
}): GetCanonicalOrderRepository => ({
  get: (query) =>
    dependencies.db.transaction(async (transaction) => {
      if (query.locationIds.length === 0) return null;
      const orders = dependencies.schema;
      const [row] = await transaction
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
            eq(orders.orders.id, query.orderId),
            inArray(orders.orderFulfillments.locationId, query.locationIds),
          ),
        )
        .limit(1);
      if (row === undefined) return null;

      const itemRows = await transaction
        .select()
        .from(orders.orderItems)
        .where(
          and(
            eq(orders.orderItems.businessId, query.businessId),
            eq(orders.orderItems.orderId, query.orderId),
          ),
        )
        .orderBy(orders.orderItems.createdAt, orders.orderItems.id);
      return {
        ...projectCanonicalOrderSummary(row),
        items: itemRows.map(itemFromRow),
      };
    }),
});
