import {
  and,
  business as businessSchema,
  eq,
  users as userSchema,
  type Database,
  type DatabaseExecutor,
} from '@pressly/db';
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
  validateReferences: async (input) => {
    const [location] = await tx
      .select({ id: businessSchema.productionLocations.id })
      .from(businessSchema.productionLocations)
      .where(
        and(
          eq(businessSchema.productionLocations.businessId, input.businessId),
          eq(businessSchema.productionLocations.id, input.locationId),
          eq(businessSchema.productionLocations.isActive, true),
        ),
      )
      .limit(1);
    if (location === undefined) return false;
    if (input.customerUserId === null) return true;
    const [customer] = await tx
      .select({ id: userSchema.users.id })
      .from(userSchema.users)
      .where(
        and(
          eq(userSchema.users.businessId, input.businessId),
          eq(userSchema.users.id, input.customerUserId),
        ),
      )
      .limit(1);
    return customer !== undefined;
  },
  createOrder: (input) => createStoredPresslyOrder(tx, input),
});

export const makePostgresCreateOrderRepository = (
  db: Database,
): CreateOrderRepository => ({
  transaction: (work) => db.transaction((tx) => work(operations(tx))),
});
