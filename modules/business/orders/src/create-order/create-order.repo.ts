import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  createStoredPresslyOrder,
  loadOrderCommandReceipt,
  lockOrderKey,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  CreateOrderOperations,
  CreateOrderRepository,
} from './create-order.port.ts';

const operations = (tx: DatabaseExecutor): CreateOrderOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  createOrder: (input) => createStoredPresslyOrder(tx, input),
});

export const makePostgresCreateOrderRepository = (
  db: Database,
): CreateOrderRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
