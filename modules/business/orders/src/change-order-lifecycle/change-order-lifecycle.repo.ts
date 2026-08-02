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
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  ChangeOrderLifecycleOperations,
  ChangeOrderLifecycleRepository,
} from './change-order-lifecycle.port.ts';

const applyOrderLifecycle = async (
  tx: DatabaseExecutor,
  input: Parameters<ChangeOrderLifecycleOperations['applyOrderLifecycle']>[0],
): Promise<void> => {
  const [updatedOrder] = await tx
    .update(schema.orders)
    .set({
      state: input.target,
      version: input.nextOrderVersion,
      updatedAt: input.now,
    })
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
      message: 'The order changed before the lifecycle transition was stored.',
      safeMessage:
        'The order changed before the lifecycle transition was stored.',
    });

  await emitFulfillmentDemand(tx, {
    businessId: input.current.order.businessId,
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

const operations = (tx: DatabaseExecutor): ChangeOrderLifecycleOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  lockOrder: (businessId, orderId) => lockStoredOrder(tx, businessId, orderId),
  loadOrder: (businessId, orderId) =>
    loadOrderAggregate(tx, businessId, orderId),
  applyOrderLifecycle: (input) => applyOrderLifecycle(tx, input),
});

export const makePostgresChangeOrderLifecycleRepository = (
  db: Database,
): ChangeOrderLifecycleRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
