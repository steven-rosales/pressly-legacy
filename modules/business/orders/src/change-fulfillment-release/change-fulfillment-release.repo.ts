import {
  and,
  eq,
  orders as schema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
import { conflictError } from '@pressly/errors';
import {
  emitFulfillmentDemand,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredFulfillment,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  ChangeFulfillmentReleaseOperations,
  ChangeFulfillmentReleaseRepository,
} from './change-fulfillment-release.port.ts';

const findOrderId = async (
  tx: DatabaseExecutor,
  businessId: string,
  fulfillmentId: string,
): Promise<string | null> => {
  const [row] = await tx
    .select({ orderId: schema.orderFulfillments.orderId })
    .from(schema.orderFulfillments)
    .where(
      and(
        eq(schema.orderFulfillments.businessId, businessId),
        eq(schema.orderFulfillments.id, fulfillmentId),
      ),
    )
    .limit(1);

  return row?.orderId ?? null;
};

const loadFulfillmentOrder = async (
  tx: DatabaseExecutor,
  businessId: string,
  fulfillmentId: string,
) => {
  const orderId = await findOrderId(tx, businessId, fulfillmentId);
  return orderId === null ? null : loadOrderAggregate(tx, businessId, orderId);
};

const applyFulfillmentRelease = async (
  tx: DatabaseExecutor,
  input: Parameters<
    ChangeFulfillmentReleaseOperations['applyFulfillmentRelease']
  >[0],
): Promise<void> => {
  const [updatedFulfillment] = await tx
    .update(schema.orderFulfillments)
    .set({
      releaseState: input.target,
      version: input.nextFulfillmentVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(schema.orderFulfillments.id, input.current.fulfillment.id),
        eq(schema.orderFulfillments.businessId, input.current.order.businessId),
        eq(schema.orderFulfillments.version, input.current.fulfillment.version),
      ),
    )
    .returning({ id: schema.orderFulfillments.id });

  if (updatedFulfillment === undefined)
    throw conflictError({
      code: 'fulfillment_version_conflict',
      message:
        'The fulfillment changed before the release transition was stored.',
      safeMessage:
        'The fulfillment changed before the release transition was stored.',
    });

  const [updatedOrder] = await tx
    .update(schema.orders)
    .set({ version: input.nextOrderVersion, updatedAt: input.now })
    .where(
      and(
        eq(schema.orders.id, input.current.order.id),
        eq(schema.orders.businessId, input.current.order.businessId),
        eq(schema.orders.version, input.current.order.version),
      ),
    )
    .returning({ id: schema.orders.id });

  if (updatedOrder === undefined)
    throw conflictError({
      code: 'order_version_conflict',
      message: 'The order changed before the fulfillment release was stored.',
      safeMessage:
        'The order changed before the fulfillment release was stored.',
    });

  await emitFulfillmentDemand(tx, {
    businessId: input.current.order.businessId,
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

const operations = (
  tx: DatabaseExecutor,
): ChangeFulfillmentReleaseOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  findOrderId: (businessId, fulfillmentId) =>
    findOrderId(tx, businessId, fulfillmentId),
  lockOrder: (businessId, orderId) => lockStoredOrder(tx, businessId, orderId),
  lockFulfillment: (businessId, fulfillmentId) =>
    lockStoredFulfillment(tx, businessId, fulfillmentId),
  loadFulfillmentOrder: (businessId, fulfillmentId) =>
    loadFulfillmentOrder(tx, businessId, fulfillmentId),
  applyFulfillmentRelease: (input) => applyFulfillmentRelease(tx, input),
});

export const makePostgresChangeFulfillmentReleaseRepository = (
  db: Database,
): ChangeFulfillmentReleaseRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
