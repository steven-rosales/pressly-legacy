import {
  and,
  desc,
  eq,
  inArray,
  lt,
  or,
  orders as schema,
  sql,
  users as userSchema,
  type Database,
} from '@pressly/db';
import {
  decodeOrderCursor,
  encodeOrderCursor,
} from './order-pagination.policy.ts';
import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderItemInput,
  OrderState,
} from '../order-model/order.model.ts';
import type {
  CanonicalOrderDetail,
  CanonicalOrderSummary,
  ReadOrdersRepository,
} from './read-orders.port.ts';

type ReadRow = Readonly<{
  order: typeof schema.orders.$inferSelect;
  fulfillment: typeof schema.orderFulfillments.$inferSelect;
  customer: typeof userSchema.users.$inferSelect | null;
}>;

const customerDisplayName = (
  row: typeof userSchema.users.$inferSelect | null,
): string | null => {
  if (row === null) return null;
  const business = row.businessName?.trim();
  if (business !== undefined && business !== '') return business;
  const person = [row.firstName, row.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return person === '' ? null : person;
};

const summary = (row: ReadRow): CanonicalOrderSummary => ({
  orderId: row.order.id,
  businessId: row.order.businessId,
  orderVersion: row.order.version,
  fulfillmentId: row.fulfillment.id,
  fulfillmentVersion: row.fulfillment.version,
  displayNumber: row.order.displayNumber,
  state: row.order.state as OrderState,
  dueAt: row.order.dueAt,
  currency: row.order.currency,
  totalAmountCents: row.order.totalAmountCents,
  balanceDueCents: row.order.balanceDueCents,
  customer: {
    resolution: row.order.customerResolution as OrderCustomer['resolution'],
    userId: row.order.customerUserId,
    displayName: customerDisplayName(row.customer),
    phone: row.customer?.phone ?? null,
    email: row.customer?.email ?? null,
  },
  fulfillment: {
    typeCode: row.fulfillment.typeCode,
    locationId: row.fulfillment.locationId,
    releaseState: row.fulfillment.releaseState as FulfillmentReleaseState,
    estimatedWeightLbs: row.fulfillment.estimatedWeightLbs,
    estimatedWeightSource: row.fulfillment.estimatedWeightSource,
    bagCount: row.fulfillment.bagCount,
  },
  createdAt: row.order.createdAt,
  updatedAt:
    row.order.updatedAt > row.fulfillment.updatedAt
      ? row.order.updatedAt
      : row.fulfillment.updatedAt,
});

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
        items: visible.map(summary),
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
    const items: readonly OrderItemInput[] = itemRows.map((item) => ({
      lineKey: item.lineKey,
      itemType: item.itemType,
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      totalAmountCents: item.totalAmountCents,
      sourceMetadata: item.sourceMetadata,
    }));
    return { ...summary(row), items } satisfies CanonicalOrderDetail;
  },
});
