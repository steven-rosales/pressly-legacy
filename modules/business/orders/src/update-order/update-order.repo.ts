import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  applyStoredOrderUpdate,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  UpdateOrderOperations,
  UpdateOrderRepository,
} from './update-order.port.ts';

const operations = (tx: DatabaseExecutor): UpdateOrderOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  lockOrder: (orderId) => lockOrderKey(tx, `orders:id:${orderId}`),
  loadOrder: (orderId) => loadOrderAggregate(tx, orderId),
  applyOrderUpdate: (input) => applyStoredOrderUpdate(tx, input),
});

export const makePostgresUpdateOrderRepository = (
  db: Database,
): UpdateOrderRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
