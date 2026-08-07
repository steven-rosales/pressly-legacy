import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as businessSchema from '@pressly/db/schema/business';
import * as userSchema from '@pressly/db/schema/users';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  createStoredPresslyOrder,
  makeOrderCommandOperations,
} from '../../../foundations/adapters/postgres/order-store/order-store.repo.ts';
import type {
  CreateOrderOperations,
  CreateOrderRepository,
} from './create-order.port.ts';

const operations = (tx: DatabaseExecutor): CreateOrderOperations => ({
  ...makeOrderCommandOperations(tx),
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
): CreateOrderRepository => defineUnitOfWork(db, operations);
