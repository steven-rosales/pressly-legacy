import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  applyStoredFulfillmentRelease,
  findOrderIdByFulfillmentId,
  loadOrderAggregateByFulfillmentId,
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

const operations = (
  tx: DatabaseExecutor,
): ChangeFulfillmentReleaseOperations => ({
  lockCommand: (key) => lockOrderKey(tx, `orders:command:${key}`),
  loadCommandReceipt: (key) => loadOrderCommandReceipt(tx, key),
  saveCommandReceipt: (input) => saveOrderCommandReceipt(tx, input),
  findOrderId: (businessId, fulfillmentId) =>
    findOrderIdByFulfillmentId(tx, businessId, fulfillmentId),
  lockOrder: (businessId, orderId) => lockStoredOrder(tx, businessId, orderId),
  lockFulfillment: (businessId, fulfillmentId) =>
    lockStoredFulfillment(tx, businessId, fulfillmentId),
  loadFulfillmentOrder: (businessId, fulfillmentId) =>
    loadOrderAggregateByFulfillmentId(tx, businessId, fulfillmentId),
  applyFulfillmentRelease: (input) => applyStoredFulfillmentRelease(tx, input),
});

export const makePostgresChangeFulfillmentReleaseRepository = (
  db: Database,
): ChangeFulfillmentReleaseRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
