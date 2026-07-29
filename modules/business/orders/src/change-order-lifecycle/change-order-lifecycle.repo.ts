import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  applyStoredOrderLifecycle,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  ChangeOrderLifecycleOperations,
  ChangeOrderLifecycleRepository,
} from './change-order-lifecycle.port.ts';

const operations = (tx: DatabaseExecutor): ChangeOrderLifecycleOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  lockOrder: (orderId) => lockOrderKey(tx, `orders:id:${orderId}`),
  loadOrder: (orderId) => loadOrderAggregate(tx, orderId),
  applyOrderLifecycle: (input) => applyStoredOrderLifecycle(tx, input),
});

export const makePostgresChangeOrderLifecycleRepository = (
  db: Database,
): ChangeOrderLifecycleRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
