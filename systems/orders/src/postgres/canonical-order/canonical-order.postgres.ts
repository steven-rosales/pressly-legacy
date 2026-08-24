import type { PostgresExecutor } from '@pressly/postgres/client';
import { and, eq, sql } from '@pressly/postgres/query';
import { invariantViolationError } from '@pressly/errors/factories';
import type { CommandContext } from '@pressly/cells/command-context';
import { fulfillmentDemandChangedV2PayloadSchema } from '../../contracts/fulfillment-demand-changed-v2.ts';
import type {
  CanonicalOrderInput,
  FulfillmentInput,
  OrderAggregate,
  OrderCustomer,
  OrderMutationResult,
  OrderState,
  StoredFulfillment,
  StoredOrder,
  StoredOrderCommandReceipt,
} from '../../model/canonical-order/model.ts';
import type { OrderCustomerSnapshot } from '../../model/canonical-order/customer-snapshot.ts';
import type { OrderDescriptionCorrection } from '../../model/canonical-order/policy.ts';
import type { OrderItemInput } from '../../model/order-input.ts';
import type { OrdersSchema } from '../../schema/orders.ts';

export type CanonicalOrderStoreSchema = Pick<
  OrdersSchema,
  | 'orderCommandReceipts'
  | 'orderFulfillments'
  | 'orderItems'
  | 'orderOutboxEvents'
  | 'orders'
>;

const invariant = (code: string, message: string): never => {
  throw invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored order data is inconsistent.',
  });
};

export const lockOrderKey = async (
  transaction: PostgresExecutor,
  key: string,
): Promise<void> => {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const lockStoredOrder = (
  transaction: PostgresExecutor,
  businessId: string,
  orderId: string,
): Promise<void> =>
  lockOrderKey(transaction, `orders:${businessId}:id:${orderId}`);

export const lockStoredFulfillment = (
  transaction: PostgresExecutor,
  businessId: string,
  fulfillmentId: string,
): Promise<void> =>
  lockOrderKey(transaction, `fulfillments:${businessId}:id:${fulfillmentId}`);

const mapOrder = (
  row: CanonicalOrderStoreSchema['orders']['$inferSelect'],
): StoredOrder => {
  if (
    row.state !== 'open' &&
    row.state !== 'completed' &&
    row.state !== 'canceled'
  )
    return invariant('ORDER_STATE_INVALID', 'Stored Order state is invalid.');
  if (
    row.customerResolution !== 'resolved' &&
    row.customerResolution !== 'not_provided' &&
    row.customerResolution !== 'pending' &&
    row.customerResolution !== 'conflict'
  )
    return invariant(
      'ORDER_CUSTOMER_RESOLUTION_INVALID',
      'Stored Order customer resolution is invalid.',
    );
  return {
    id: row.id,
    businessId: row.businessId,
    version: row.version,
    customerId: row.customerId,
    customerSnapshot:
      row.customerId === null || row.customerVersion === null
        ? null
        : {
            customerId: row.customerId,
            customerVersion: row.customerVersion,
            firstName: row.customerFirstName,
            lastName: row.customerLastName,
            businessName: row.customerBusinessName,
            phone: row.customerPhone,
            email: row.customerEmail,
          },
    customerResolution: row.customerResolution,
    displayNumber: row.displayNumber,
    state: row.state,
    dueAt: row.dueAt,
    currency: row.currency,
    totalAmountCents: row.totalAmountCents,
    balanceDueCents: row.balanceDueCents,
  };
};

const mapFulfillment = (
  row: CanonicalOrderStoreSchema['orderFulfillments']['$inferSelect'],
): StoredFulfillment => {
  if (
    row.releaseState !== 'unreleased' &&
    row.releaseState !== 'released' &&
    row.releaseState !== 'withdrawn'
  )
    return invariant(
      'FULFILLMENT_RELEASE_STATE_INVALID',
      'Stored fulfillment release state is invalid.',
    );
  return {
    id: row.id,
    businessId: row.businessId,
    orderId: row.orderId,
    version: row.version,
    typeCode: row.typeCode,
    locationId: row.locationId,
    releaseState: row.releaseState,
    estimatedWeightLbs: row.estimatedWeightLbs,
    estimatedWeightSource: row.estimatedWeightSource,
  };
};

export const loadOrderAggregate = async (
  transaction: PostgresExecutor,
  orders: CanonicalOrderStoreSchema,
  businessId: string,
  orderId: string,
): Promise<OrderAggregate | null> => {
  const [order] = await transaction
    .select()
    .from(orders.orders)
    .where(
      and(
        eq(orders.orders.businessId, businessId),
        eq(orders.orders.id, orderId),
      ),
    )
    .limit(1);
  if (order === undefined) return null;
  const fulfillments = await transaction
    .select()
    .from(orders.orderFulfillments)
    .where(
      and(
        eq(orders.orderFulfillments.businessId, businessId),
        eq(orders.orderFulfillments.orderId, orderId),
      ),
    );
  const [fulfillment] = fulfillments;
  if (fulfillments.length !== 1 || fulfillment === undefined)
    return invariant(
      'ORDER_FULFILLMENT_CARDINALITY_INVALID',
      'The version-one Orders application requires exactly one fulfillment.',
    );
  return {
    order: mapOrder(order),
    fulfillment: mapFulfillment(fulfillment),
  };
};

export const loadOrderCommandReceipt = async (
  transaction: PostgresExecutor,
  orders: Pick<CanonicalOrderStoreSchema, 'orderCommandReceipts'>,
  idempotencyKey: string,
): Promise<StoredOrderCommandReceipt | null> => {
  const [row] = await transaction
    .select({
      commandHash: orders.orderCommandReceipts.commandHash,
      result: orders.orderCommandReceipts.result,
    })
    .from(orders.orderCommandReceipts)
    .where(eq(orders.orderCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);
  if (row === undefined) return null;
  const stored = row.result;
  if (
    stored === null ||
    typeof stored !== 'object' ||
    !('orderId' in stored) ||
    !('fulfillmentId' in stored) ||
    !('version' in stored) ||
    typeof stored.orderId !== 'string' ||
    typeof stored.fulfillmentId !== 'string' ||
    typeof stored.version !== 'number'
  )
    return invariant(
      'ORDER_COMMAND_RECEIPT_INVALID',
      'Stored order command result is invalid.',
    );
  return {
    commandHash: row.commandHash,
    result: {
      orderId: stored.orderId,
      fulfillmentId: stored.fulfillmentId,
      version: stored.version,
      replayed: false,
    },
  };
};

export const saveOrderCommandReceipt = async (
  transaction: PostgresExecutor,
  orders: Pick<CanonicalOrderStoreSchema, 'orderCommandReceipts'>,
  input: Readonly<{
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    reasonCode: string;
    reasonNote: string | null;
    value: OrderMutationResult;
    now: Date;
  }>,
): Promise<void> => {
  await transaction.insert(orders.orderCommandReceipts).values({
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: input.context.origin,
    actorKind: input.context.principal.kind,
    actorId: input.context.principal.id,
    orderId: input.value.orderId,
    result: input.value,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    createdAt: input.now,
  });
};

export const insertOrderItems = async (
  transaction: PostgresExecutor,
  orders: Pick<CanonicalOrderStoreSchema, 'orderItems'>,
  businessId: string,
  orderId: string,
  items: readonly OrderItemInput[],
  now: Date,
): Promise<void> => {
  if (items.length === 0) return;
  await transaction.insert(orders.orderItems).values(
    items.map((item) => ({
      businessId,
      orderId,
      lineKey: item.lineKey,
      itemType: item.itemType,
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      totalAmountCents: item.totalAmountCents,
      sourceMetadata: item.sourceMetadata,
      createdAt: now,
      updatedAt: now,
    })),
  );
};

export const emitFulfillmentDemand = async (
  transaction: PostgresExecutor,
  orders: Pick<CanonicalOrderStoreSchema, 'orderOutboxEvents'>,
  input: Readonly<{
    orderId: string;
    fulfillmentId: string;
    aggregateVersion: number;
    displayNumber: string | null;
    dueAt: Date;
    commercialState: OrderState;
    fulfillment: FulfillmentInput;
    now: Date;
  }>,
): Promise<void> => {
  const payload = fulfillmentDemandChangedV2PayloadSchema.parse({
    schemaVersion: 2,
    eventType: 'fulfillment_demand_changed',
    fulfillmentId: input.fulfillmentId,
    displayNumber: input.displayNumber,
    locationId: input.fulfillment.locationId,
    typeCode: input.fulfillment.typeCode,
    admissionState: input.fulfillment.releaseState,
    commercialState: input.commercialState,
    dueAt: input.dueAt.toISOString(),
    estimatedWeightLbs: input.fulfillment.estimatedWeightLbs,
    estimatedWeightSource: input.fulfillment.estimatedWeightSource,
    version: input.aggregateVersion,
    observedAt: input.now.toISOString(),
  });
  await transaction.insert(orders.orderOutboxEvents).values({
    orderId: input.orderId,
    fulfillmentId: input.fulfillmentId,
    eventType: payload.eventType,
    aggregateVersion: input.aggregateVersion,
    payload,
    status: 'pending',
    attempts: 0,
    availableAt: input.now,
    createdAt: input.now,
  });
};

const customerColumns = (
  customer: OrderCustomer,
  snapshot: OrderCustomerSnapshot | null,
) => {
  if (
    customer.resolution === 'resolved' &&
    (snapshot === null || snapshot.customerId !== customer.userId)
  )
    return invariant(
      'ORDER_CUSTOMER_SNAPSHOT_INVALID',
      'A resolved Order customer requires its matching Customer snapshot.',
    );
  if (customer.resolution !== 'resolved' && snapshot !== null)
    return invariant(
      'ORDER_CUSTOMER_SNAPSHOT_INVALID',
      'An unresolved Order customer cannot retain a Customer snapshot.',
    );
  return {
    customerId: snapshot?.customerId ?? null,
    customerVersion: snapshot?.customerVersion ?? null,
    customerFirstName: snapshot?.firstName ?? null,
    customerLastName: snapshot?.lastName ?? null,
    customerBusinessName: snapshot?.businessName ?? null,
    customerPhone: snapshot?.phone ?? null,
    customerEmail: snapshot?.email ?? null,
    customerResolution: customer.resolution,
  };
};

export const createStoredOrder = async (
  transaction: PostgresExecutor,
  orders: CanonicalOrderStoreSchema,
  input: Readonly<{
    businessId: string;
    order: CanonicalOrderInput;
    customerSnapshot: OrderCustomerSnapshot | null;
    now: Date;
  }>,
): Promise<OrderMutationResult> => {
  const [createdOrder] = await transaction
    .insert(orders.orders)
    .values({
      businessId: input.businessId,
      ...customerColumns(input.order.customer, input.customerSnapshot),
      displayNumber: input.order.displayNumber,
      state: input.order.state,
      dueAt: input.order.dueAt,
      currency: input.order.currency,
      totalAmountCents: input.order.totalAmountCents,
      balanceDueCents: input.order.balanceDueCents,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: orders.orders.id, version: orders.orders.version });
  if (createdOrder === undefined)
    return invariant(
      'ORDER_INSERT_RESULT_MISSING',
      'Order insert returned no row.',
    );
  await insertOrderItems(
    transaction,
    orders,
    input.businessId,
    createdOrder.id,
    input.order.items,
    input.now,
  );
  const [createdFulfillment] = await transaction
    .insert(orders.orderFulfillments)
    .values({
      businessId: input.businessId,
      orderId: createdOrder.id,
      ...input.order.fulfillment,
      version: 1,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning({ id: orders.orderFulfillments.id });
  if (createdFulfillment === undefined)
    return invariant(
      'FULFILLMENT_INSERT_RESULT_MISSING',
      'Fulfillment insert returned no row.',
    );
  await emitFulfillmentDemand(transaction, orders, {
    orderId: createdOrder.id,
    fulfillmentId: createdFulfillment.id,
    aggregateVersion: createdOrder.version,
    displayNumber: input.order.displayNumber,
    dueAt: input.order.dueAt,
    commercialState: input.order.state,
    fulfillment: input.order.fulfillment,
    now: input.now,
  });
  return {
    orderId: createdOrder.id,
    fulfillmentId: createdFulfillment.id,
    version: createdOrder.version,
    replayed: false,
  };
};

export const applyOrderLifecycle = async (
  transaction: PostgresExecutor,
  orders: CanonicalOrderStoreSchema,
  input: Readonly<{
    current: OrderAggregate;
    target: 'completed' | 'canceled';
    nextOrderVersion: number;
    now: Date;
  }>,
): Promise<void> => {
  const [updated] = await transaction
    .update(orders.orders)
    .set({
      state: input.target,
      version: input.nextOrderVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(orders.orders.id, input.current.order.id),
        eq(orders.orders.businessId, input.current.order.businessId),
        eq(orders.orders.version, input.current.order.version),
      ),
    )
    .returning({ id: orders.orders.id });
  if (updated === undefined)
    return invariant(
      'ORDER_LIFECYCLE_LOCK_INVALID',
      'The locked Order changed before its lifecycle transition was stored.',
    );
  await emitFulfillmentDemand(transaction, orders, {
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber: input.current.order.displayNumber,
    dueAt: input.current.order.dueAt,
    commercialState: input.target,
    fulfillment: input.current.fulfillment,
    now: input.now,
  });
};

export const applyFulfillmentRelease = async (
  transaction: PostgresExecutor,
  orders: CanonicalOrderStoreSchema,
  input: Readonly<{
    current: OrderAggregate;
    target: 'released' | 'withdrawn';
    nextOrderVersion: number;
    nextFulfillmentVersion: number;
    now: Date;
  }>,
): Promise<void> => {
  const [fulfillment] = await transaction
    .update(orders.orderFulfillments)
    .set({
      releaseState: input.target,
      version: input.nextFulfillmentVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(orders.orderFulfillments.id, input.current.fulfillment.id),
        eq(orders.orderFulfillments.businessId, input.current.order.businessId),
        eq(orders.orderFulfillments.version, input.current.fulfillment.version),
      ),
    )
    .returning({ id: orders.orderFulfillments.id });
  if (fulfillment === undefined)
    return invariant(
      'FULFILLMENT_RELEASE_LOCK_INVALID',
      'The locked fulfillment changed before its release transition was stored.',
    );
  const [order] = await transaction
    .update(orders.orders)
    .set({ version: input.nextOrderVersion, updatedAt: input.now })
    .where(
      and(
        eq(orders.orders.id, input.current.order.id),
        eq(orders.orders.businessId, input.current.order.businessId),
        eq(orders.orders.version, input.current.order.version),
      ),
    )
    .returning({ id: orders.orders.id });
  if (order === undefined)
    return invariant(
      'ORDER_FULFILLMENT_RELEASE_LOCK_INVALID',
      'The locked Order changed before the fulfillment release was stored.',
    );
  await emitFulfillmentDemand(transaction, orders, {
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber: input.current.order.displayNumber,
    dueAt: input.current.order.dueAt,
    commercialState: input.current.order.state,
    fulfillment: { ...input.current.fulfillment, releaseState: input.target },
    now: input.now,
  });
};

export const applyOrderCorrection = async (
  transaction: PostgresExecutor,
  orders: CanonicalOrderStoreSchema,
  input: Readonly<{
    current: OrderAggregate;
    changes: OrderDescriptionCorrection;
    customerSnapshot: OrderCustomerSnapshot | null | undefined;
    nextFulfillment: StoredFulfillment;
    nextOrderVersion: number;
    nextFulfillmentVersion: number;
    now: Date;
  }>,
): Promise<void> => {
  const customer = input.changes.customer;
  const [updatedOrder] = await transaction
    .update(orders.orders)
    .set({
      ...(customer === undefined
        ? {}
        : customerColumns(customer, input.customerSnapshot ?? null)),
      ...(input.changes.displayNumber === undefined
        ? {}
        : { displayNumber: input.changes.displayNumber }),
      ...(input.changes.dueAt === undefined
        ? {}
        : { dueAt: input.changes.dueAt }),
      ...(input.changes.currency === undefined
        ? {}
        : { currency: input.changes.currency }),
      ...(input.changes.totalAmountCents === undefined
        ? {}
        : { totalAmountCents: input.changes.totalAmountCents }),
      ...(input.changes.balanceDueCents === undefined
        ? {}
        : { balanceDueCents: input.changes.balanceDueCents }),
      version: input.nextOrderVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(orders.orders.id, input.current.order.id),
        eq(orders.orders.businessId, input.current.order.businessId),
        eq(orders.orders.version, input.current.order.version),
      ),
    )
    .returning({ id: orders.orders.id });
  if (updatedOrder === undefined)
    return invariant(
      'ORDER_CORRECTION_LOCK_INVALID',
      'The locked Order changed before the correction was stored.',
    );
  if (input.changes.items !== undefined) {
    await transaction
      .delete(orders.orderItems)
      .where(eq(orders.orderItems.orderId, input.current.order.id));
    await insertOrderItems(
      transaction,
      orders,
      input.current.order.businessId,
      input.current.order.id,
      input.changes.items,
      input.now,
    );
  }
  if (input.nextFulfillmentVersion !== input.current.fulfillment.version) {
    const [updatedFulfillment] = await transaction
      .update(orders.orderFulfillments)
      .set({
        typeCode: input.nextFulfillment.typeCode,
        locationId: input.nextFulfillment.locationId,
        estimatedWeightLbs: input.nextFulfillment.estimatedWeightLbs,
        estimatedWeightSource: input.nextFulfillment.estimatedWeightSource,
        version: input.nextFulfillmentVersion,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(orders.orderFulfillments.id, input.current.fulfillment.id),
          eq(
            orders.orderFulfillments.businessId,
            input.current.order.businessId,
          ),
          eq(
            orders.orderFulfillments.version,
            input.current.fulfillment.version,
          ),
        ),
      )
      .returning({ id: orders.orderFulfillments.id });
    if (updatedFulfillment === undefined)
      return invariant(
        'FULFILLMENT_CORRECTION_LOCK_INVALID',
        'The locked fulfillment changed before the correction was stored.',
      );
  }
  await emitFulfillmentDemand(transaction, orders, {
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber:
      input.changes.displayNumber === undefined
        ? input.current.order.displayNumber
        : input.changes.displayNumber,
    dueAt: input.changes.dueAt ?? input.current.order.dueAt,
    commercialState: input.current.order.state,
    fulfillment: input.nextFulfillment,
    now: input.now,
  });
};

export const findOrderIdForFulfillment = async (
  transaction: PostgresExecutor,
  orders: Pick<CanonicalOrderStoreSchema, 'orderFulfillments'>,
  businessId: string,
  fulfillmentId: string,
): Promise<string | null> => {
  const [row] = await transaction
    .select({ orderId: orders.orderFulfillments.orderId })
    .from(orders.orderFulfillments)
    .where(
      and(
        eq(orders.orderFulfillments.businessId, businessId),
        eq(orders.orderFulfillments.id, fulfillmentId),
      ),
    )
    .limit(1);
  return row?.orderId ?? null;
};
