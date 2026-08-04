import { type DatabaseExecutor } from '@pressly/db/client';
import { and, eq, sql } from '@pressly/db/query';
import * as schema from '@pressly/db/schema/orders';
import type { CommandContext } from '@pressly/kernel';
import type { OrderMutationResult } from '../../../language/command-execution/order-command.model.ts';
import type { StoredOrderCommandReceipt } from '../../../language/command-execution/order-command-receipt.model.ts';
import type {
  FulfillmentInput,
  OrderInput,
  OrderItemInput,
  OrderState,
} from '../../../language/order/order.model.ts';
import { fulfillmentDemandEvent } from '../../../language/order-outbox/order-outbox.policy.ts';
import { toSerializedFulfillmentDemandEvent } from '../../outbox/fulfillment-demand-codec/fulfillment-demand.contract.mapper.ts';
import type { OrderAggregate } from '../../../language/order/order.entity.ts';
import { orderPersistenceInvariant } from './order-store.error.ts';
import {
  customerColumns,
  storedFulfillmentFromRow,
  storedOrderCommandReceiptFromRow,
  storedOrderFromRow,
} from './order-store.persistence.mapper.ts';

export const lockOrderKey = async (
  db: DatabaseExecutor,
  key: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const lockStoredOrder = (
  db: DatabaseExecutor,
  businessId: string,
  orderId: string,
): Promise<void> => lockOrderKey(db, `orders:${businessId}:id:${orderId}`);

export const lockStoredFulfillment = (
  db: DatabaseExecutor,
  businessId: string,
  fulfillmentId: string,
): Promise<void> =>
  lockOrderKey(db, `fulfillments:${businessId}:id:${fulfillmentId}`);

export const insertOrderItems = async (
  db: DatabaseExecutor,
  businessId: string,
  orderId: string,
  items: readonly OrderItemInput[],
  now: Date,
): Promise<void> => {
  if (items.length === 0) return;
  await db.insert(schema.orderItems).values(
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
  db: DatabaseExecutor,
  input: {
    businessId: string;
    orderId: string;
    fulfillmentId: string;
    aggregateVersion: number;
    displayNumber: string | null;
    dueAt: Date;
    commercialState: OrderState;
    fulfillment: FulfillmentInput;
    now: Date;
  },
): Promise<void> => {
  const event = toSerializedFulfillmentDemandEvent(
    fulfillmentDemandEvent({
      fulfillmentId: input.fulfillmentId,
      displayNumber: input.displayNumber,
      locationId: input.fulfillment.locationId,
      typeCode: input.fulfillment.typeCode,
      admissionState: input.fulfillment.releaseState,
      commercialState: input.commercialState,
      dueAt: input.dueAt,
      estimatedWeightLbs: input.fulfillment.estimatedWeightLbs,
      estimatedWeightSource: input.fulfillment.estimatedWeightSource,
      // Physical intake belongs to Production. Orders demand events never
      // promote a legacy or source-populated fulfillment value into physical
      // truth.
      bagCount: null,
      version: input.aggregateVersion,
      observedAt: input.now,
    }),
  );

  await db.insert(schema.orderOutboxEvents).values({
    orderId: input.orderId,
    fulfillmentId: input.fulfillmentId,
    eventType: event.eventType,
    aggregateVersion: input.aggregateVersion,
    payload: event,
    status: 'pending',
    attempts: 0,
    availableAt: input.now,
    createdAt: input.now,
  });
};

const createOrderRows = async (
  db: DatabaseExecutor,
  businessId: string,
  order: OrderInput,
  now: Date,
): Promise<OrderMutationResult> => {
  const [createdOrder] = await db
    .insert(schema.orders)
    .values({
      businessId,
      ...customerColumns(order.customer),
      displayNumber: order.displayNumber,
      state: order.state,
      dueAt: order.dueAt,
      currency: order.currency,
      totalAmountCents: order.totalAmountCents,
      balanceDueCents: order.balanceDueCents,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.orders.id, version: schema.orders.version });
  if (createdOrder === undefined)
    throw orderPersistenceInvariant(
      'ORDER_INSERT_RESULT_MISSING',
      'Order insert returned no row.',
    );
  await insertOrderItems(db, businessId, createdOrder.id, order.items, now);
  const [createdFulfillment] = await db
    .insert(schema.orderFulfillments)
    .values({
      businessId,
      orderId: createdOrder.id,
      ...order.fulfillment,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.orderFulfillments.id });
  if (createdFulfillment === undefined)
    throw orderPersistenceInvariant(
      'FULFILLMENT_INSERT_RESULT_MISSING',
      'Fulfillment insert returned no row.',
    );
  await emitFulfillmentDemand(db, {
    businessId,
    orderId: createdOrder.id,
    fulfillmentId: createdFulfillment.id,
    aggregateVersion: createdOrder.version,
    displayNumber: order.displayNumber,
    dueAt: order.dueAt,
    commercialState: order.state,
    fulfillment: order.fulfillment,
    now,
  });
  return {
    orderId: createdOrder.id,
    fulfillmentId: createdFulfillment.id,
    version: createdOrder.version,
    replayed: false,
  };
};

export const createStoredPresslyOrder = async (
  db: DatabaseExecutor,
  input: {
    businessId: string;
    order: OrderInput;
    now: Date;
  },
): Promise<OrderMutationResult> => {
  return createOrderRows(db, input.businessId, input.order, input.now);
};

export const loadOrderCommandReceipt = async (
  db: DatabaseExecutor,
  idempotencyKey: string,
): Promise<StoredOrderCommandReceipt | null> => {
  const [row] = await db
    .select({
      commandHash: schema.orderCommandReceipts.commandHash,
      result: schema.orderCommandReceipts.result,
    })
    .from(schema.orderCommandReceipts)
    .where(eq(schema.orderCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);
  return row === undefined ? null : storedOrderCommandReceiptFromRow(row);
};

export const saveOrderCommandReceipt = async (
  db: DatabaseExecutor,
  input: {
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
    reasonCode: string;
    reasonNote: string | null;
    value: OrderMutationResult;
    now: Date;
  },
): Promise<void> => {
  await db.insert(schema.orderCommandReceipts).values({
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

export const loadOrderAggregate = async (
  db: DatabaseExecutor,
  businessId: string,
  orderId: string,
): Promise<OrderAggregate | null> => {
  const [orderRow] = await db
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.businessId, businessId),
        eq(schema.orders.id, orderId),
      ),
    )
    .limit(1);
  if (orderRow === undefined) return null;
  const fulfillments = await db
    .select()
    .from(schema.orderFulfillments)
    .where(
      and(
        eq(schema.orderFulfillments.businessId, businessId),
        eq(schema.orderFulfillments.orderId, orderId),
      ),
    );
  if (fulfillments.length !== 1)
    throw orderPersistenceInvariant(
      'ORDER_FULFILLMENT_CARDINALITY_INVALID',
      'The version-one Orders application requires exactly one fulfillment.',
    );
  return {
    order: storedOrderFromRow(orderRow),
    fulfillment: storedFulfillmentFromRow(fulfillments[0]!),
  };
};
