import type { Database, DatabaseExecutor } from '@pressly/db';
import {
  applyStoredFulfillmentRelease,
  loadOrderAggregateByFulfillmentId,
  loadOrderCommandReceipt,
  lockOrderKey,
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
  lockFulfillment: (fulfillmentId) =>
    lockOrderKey(tx, `fulfillments:id:${fulfillmentId}`),
  loadFulfillmentOrder: (fulfillmentId) =>
    loadOrderAggregateByFulfillmentId(tx, fulfillmentId),
  applyFulfillmentRelease: (input) => applyStoredFulfillmentRelease(tx, input),
});

export const makePostgresChangeFulfillmentReleaseRepository = (
  db: Database,
): ChangeFulfillmentReleaseRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
