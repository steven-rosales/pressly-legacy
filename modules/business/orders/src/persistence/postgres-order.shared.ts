import { eq, orders as schema, sql, type DatabaseExecutor } from '@pressly/db';
import { fulfillmentDemandChangedEventType } from '@pressly/contracts';
import type { CommandContext } from '@pressly/kernel';
import { fulfillmentDemandEvent } from '../order-outbox.policy.ts';
import type {
  StoredFulfillmentRecord,
  StoredOrderAggregate,
  StoredOrderRecord,
} from '../order-aggregate.port.ts';
import type { StoredOrderCommandReceipt } from '../order-transaction.port.ts';
import type {
  FulfillmentInput,
  FulfillmentReleaseState,
  OrderCustomer,
  OrderInput,
  OrderItemInput,
  OrderMutationResult,
  OrderState,
  UpdateOrderCommand,
} from '../orders.port.ts';

const orderStates = new Set<OrderState>(['open', 'completed', 'canceled']);
const releaseStates = new Set<FulfillmentReleaseState>([
  'unreleased',
  'released',
  'withdrawn',
]);
const customerResolutions = new Set<OrderCustomer['resolution']>([
  'resolved',
  'not_provided',
  'pending',
  'conflict',
  'legacy_unknown',
]);

export const lockOrderKey = async (
  db: DatabaseExecutor,
  key: string,
): Promise<void> => {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
};

export const customerColumns = (customer: OrderCustomer) => ({
  customerUserId: customer.userId,
  customerResolution: customer.resolution,
});

export const insertOrderItems = async (
  db: DatabaseExecutor,
  orderId: string,
  items: readonly OrderItemInput[],
  now: Date,
): Promise<void> => {
  if (items.length === 0) return;
  await db.insert(schema.orderItems).values(
    items.map((item) => ({
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
  await db.insert(schema.orderOutboxEvents).values({
    orderId: input.orderId,
    fulfillmentId: input.fulfillmentId,
    eventType: fulfillmentDemandChangedEventType,
    aggregateVersion: input.aggregateVersion,
    payload: fulfillmentDemandEvent({
      fulfillmentId: input.fulfillmentId,
      displayNumber: input.displayNumber,
      locationId: input.fulfillment.locationId,
      typeCode: input.fulfillment.typeCode,
      admissionState: input.fulfillment.releaseState,
      commercialState: input.commercialState,
      dueAt: input.dueAt,
      estimatedWeightLbs: input.fulfillment.estimatedWeightLbs,
      estimatedWeightSource: input.fulfillment.estimatedWeightSource,
      bagCount: input.fulfillment.bagCount,
      version: input.aggregateVersion,
      observedAt: input.now,
    }),
    status: 'pending',
    attempts: 0,
    availableAt: input.now,
    createdAt: input.now,
  });
};

export const createOrderRows = async (
  db: DatabaseExecutor,
  order: OrderInput,
  now: Date,
): Promise<OrderMutationResult> => {
  const [createdOrder] = await db
    .insert(schema.orders)
    .values({
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
    throw new Error('Order insert returned no row.');
  await insertOrderItems(db, createdOrder.id, order.items, now);
  const [createdFulfillment] = await db
    .insert(schema.orderFulfillments)
    .values({
      orderId: createdOrder.id,
      ...order.fulfillment,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: schema.orderFulfillments.id });
  if (createdFulfillment === undefined)
    throw new Error('Fulfillment insert returned no row.');
  await emitFulfillmentDemand(db, {
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
    order: OrderInput;
    authorityFields: readonly string[];
    now: Date;
  },
): Promise<OrderMutationResult> => {
  const value = await createOrderRows(db, input.order, input.now);
  await upsertOrderAuthorities(db, {
    orderId: value.orderId,
    fields: input.authorityFields,
    authority: 'pressly',
    source: null,
    now: input.now,
  });
  return value;
};

export const parseOrderCommandReceipt = (row: {
  commandHash: string;
  result: unknown;
}): StoredOrderCommandReceipt => {
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
    throw new Error('Stored order command result is invalid.');
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
  return row === undefined ? null : parseOrderCommandReceipt(row);
};

export const saveOrderCommandReceipt = async (
  db: DatabaseExecutor,
  input: {
    idempotencyKey: string;
    commandHash: string;
    context: CommandContext;
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
    createdAt: input.now,
  });
};

export const orderFromRow = (row: {
  id: string;
  version: number;
  customerUserId: string | null;
  customerResolution: string;
  displayNumber: string | null;
  state: string;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
}): StoredOrderRecord => {
  if (!orderStates.has(row.state as OrderState))
    throw new Error('Stored Order state is invalid.');
  if (
    !customerResolutions.has(
      row.customerResolution as OrderCustomer['resolution'],
    )
  )
    throw new Error('Stored Order customer resolution is invalid.');
  return {
    ...row,
    state: row.state as OrderState,
    customerResolution: row.customerResolution as OrderCustomer['resolution'],
  };
};

export const fulfillmentFromRow = (row: {
  id: string;
  orderId: string;
  version: number;
  typeCode: string;
  locationId: string;
  releaseState: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
}): StoredFulfillmentRecord => {
  if (!releaseStates.has(row.releaseState as FulfillmentReleaseState))
    throw new Error('Stored Fulfillment release state is invalid.');
  return {
    ...row,
    releaseState: row.releaseState as FulfillmentReleaseState,
  };
};

export const loadOrderAggregate = async (
  db: DatabaseExecutor,
  orderId: string,
): Promise<StoredOrderAggregate | null> => {
  const [orderRow] = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.id, orderId))
    .limit(1);
  if (orderRow === undefined) return null;
  const fulfillments = await db
    .select()
    .from(schema.orderFulfillments)
    .where(eq(schema.orderFulfillments.orderId, orderId));
  if (fulfillments.length !== 1)
    throw new Error(
      'The version-one Orders application requires exactly one fulfillment.',
    );
  return {
    order: orderFromRow(orderRow),
    fulfillment: fulfillmentFromRow(fulfillments[0]!),
  };
};

export const loadOrderAggregateByFulfillmentId = async (
  db: DatabaseExecutor,
  fulfillmentId: string,
): Promise<StoredOrderAggregate | null> => {
  const [row] = await db
    .select({ orderId: schema.orderFulfillments.orderId })
    .from(schema.orderFulfillments)
    .where(eq(schema.orderFulfillments.id, fulfillmentId))
    .limit(1);
  return row === undefined ? null : loadOrderAggregate(db, row.orderId);
};

export const upsertOrderAuthorities = async (
  db: DatabaseExecutor,
  input: {
    orderId: string;
    fields: readonly string[];
    authority: 'pressly' | 'source';
    source: string | null;
    now: Date;
  },
): Promise<void> => {
  for (const fieldName of input.fields)
    await db
      .insert(schema.orderFieldAuthorities)
      .values({
        orderId: input.orderId,
        fieldName,
        authority: input.authority,
        source: input.source,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: [
          schema.orderFieldAuthorities.orderId,
          schema.orderFieldAuthorities.fieldName,
        ],
        set: {
          authority: input.authority,
          source: input.source,
          updatedAt: input.now,
        },
      });
};

export const applyStoredOrderUpdate = async (
  db: DatabaseExecutor,
  input: {
    current: StoredOrderAggregate;
    changes: UpdateOrderCommand['changes'];
    targetState: StoredOrderAggregate['order']['state'];
    authorityFields: readonly string[];
    nextOrderVersion: number;
    now: Date;
  },
): Promise<void> => {
  const customer = input.changes.customer;
  await db
    .update(schema.orders)
    .set({
      ...(customer === undefined ? {} : customerColumns(customer)),
      ...(input.changes.displayNumber === undefined
        ? {}
        : { displayNumber: input.changes.displayNumber }),
      state: input.targetState,
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
    .where(eq(schema.orders.id, input.current.order.id));
  await upsertOrderAuthorities(db, {
    orderId: input.current.order.id,
    fields: input.authorityFields,
    authority: 'pressly',
    source: null,
    now: input.now,
  });
  await emitFulfillmentDemand(db, {
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber:
      input.changes.displayNumber === undefined
        ? input.current.order.displayNumber
        : input.changes.displayNumber,
    dueAt: input.changes.dueAt ?? input.current.order.dueAt,
    commercialState: input.targetState,
    fulfillment: input.current.fulfillment,
    now: input.now,
  });
};

export const applyStoredFulfillmentRelease = async (
  db: DatabaseExecutor,
  input: {
    current: StoredOrderAggregate;
    target: FulfillmentReleaseState;
    authorityField: string;
    nextOrderVersion: number;
    nextFulfillmentVersion: number;
    now: Date;
  },
): Promise<void> => {
  await db
    .update(schema.orderFulfillments)
    .set({
      releaseState: input.target,
      version: input.nextFulfillmentVersion,
      updatedAt: input.now,
    })
    .where(eq(schema.orderFulfillments.id, input.current.fulfillment.id));
  await db
    .update(schema.orders)
    .set({ version: input.nextOrderVersion, updatedAt: input.now })
    .where(eq(schema.orders.id, input.current.order.id));
  await upsertOrderAuthorities(db, {
    orderId: input.current.order.id,
    fields: [input.authorityField],
    authority: 'pressly',
    source: null,
    now: input.now,
  });
  await emitFulfillmentDemand(db, {
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber: input.current.order.displayNumber,
    dueAt: input.current.order.dueAt,
    commercialState: input.current.order.state,
    fulfillment: {
      ...input.current.fulfillment,
      releaseState: input.target,
    },
    now: input.now,
  });
};
