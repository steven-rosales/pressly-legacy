import {
  and,
  eq,
  users as userSchema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
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
  lockOrder: (businessId, orderId) => lockStoredOrder(tx, businessId, orderId),
  lockFulfillment: (businessId, fulfillmentId) =>
    lockStoredFulfillment(tx, businessId, fulfillmentId),
  loadOrder: (businessId, orderId) =>
    loadOrderAggregate(tx, businessId, orderId),
  customerExists: async (businessId, userId) => {
    const [customer] = await tx
      .select({ id: userSchema.users.id })
      .from(userSchema.users)
      .where(
        and(
          eq(userSchema.users.businessId, businessId),
          eq(userSchema.users.id, userId),
        ),
      )
      .limit(1);
    return customer !== undefined;
  },
  applyOrderCorrection: (input) => applyStoredOrderCorrection(tx, input),
});

export const makePostgresCorrectOrderRepository = (
  db: Database,
): CorrectOrderRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
