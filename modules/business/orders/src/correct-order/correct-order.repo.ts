import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  applyStoredOrderCorrection,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredFulfillment,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../persistence/postgres-order.shared.ts';
import type {
  CorrectOrderOperations,
  CorrectOrderRepository,
} from './correct-order.port.ts';

const operations = (tx: DatabaseExecutor): CorrectOrderOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  lockOrder: (orderId) => lockStoredOrder(tx, orderId),
  lockFulfillment: (fulfillmentId) => lockStoredFulfillment(tx, fulfillmentId),
  loadOrder: (orderId) => loadOrderAggregate(tx, orderId),
  applyOrderCorrection: (input) => applyStoredOrderCorrection(tx, input),
});

export const makePostgresCorrectOrderRepository = (
  db: Database,
): CorrectOrderRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
