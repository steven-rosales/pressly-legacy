import { type Database, type DatabaseExecutor } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as orderSchema from '@pressly/db/schema/orders';
import * as userSchema from '@pressly/db/schema/users';
import { defineUnitOfWork } from '@pressly/db/unit-of-work';
import {
  emitFulfillmentDemand,
  insertOrderItems,
  loadOrderAggregate,
  loadOrderCommandReceipt,
  lockOrderKey,
  lockStoredFulfillment,
  lockStoredOrder,
  saveOrderCommandReceipt,
} from '../../../foundations/adapters/postgres/order-store/order-store.repo.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import { customerColumns } from '../../../foundations/adapters/postgres/order-store/order-store.persistence.mapper.ts';
import type {
  CorrectOrderOperations,
  CorrectOrderRepository,
} from './correct-order.port.ts';

const applyOrderCorrection = async (
  tx: DatabaseExecutor,
  input: Parameters<CorrectOrderOperations['applyOrderCorrection']>[0],
): Promise<void> => {
  const customer = input.changes.customer;
  const [updatedOrder] = await tx
    .update(orderSchema.orders)
    .set({
      ...(customer === undefined ? {} : customerColumns(customer)),
      ...(input.changes.displayNumber === undefined
        ? {}
        : { displayNumber: input.changes.displayNumber }),
      ...(input.changes.dueAt === undefined
        ? {}
        : { dueAt: input.changes.dueAt }),
      ...(input.changes.currency === undefined
        ? {}
        : { currency: input.changes.currency }),
      ...(input.changes.totalAmountCents === undefined
        ? {}
        : { totalAmountCents: input.changes.totalAmountCents }),
      ...(input.changes.balanceDueCents === undefined
        ? {}
        : { balanceDueCents: input.changes.balanceDueCents }),
      version: input.nextOrderVersion,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(orderSchema.orders.id, input.current.order.id),
        eq(orderSchema.orders.businessId, input.current.order.businessId),
        eq(orderSchema.orders.version, input.current.order.version),
      ),
    )
    .returning({ id: orderSchema.orders.id });

  if (updatedOrder === undefined)
    throw orderInvariantError(
      'ORDER_CORRECTION_LOCK_INVALID',
      'The locked Order changed before the correction was stored.',
    );

  if (input.changes.items !== undefined) {
    await tx
      .delete(orderSchema.orderItems)
      .where(eq(orderSchema.orderItems.orderId, input.current.order.id));
    await insertOrderItems(
      tx,
      input.current.order.businessId,
      input.current.order.id,
      input.changes.items,
      input.now,
    );
  }

  if (input.nextFulfillmentVersion !== input.current.fulfillment.version) {
    const [updatedFulfillment] = await tx
      .update(orderSchema.orderFulfillments)
      .set({
        typeCode: input.nextFulfillment.typeCode,
        locationId: input.nextFulfillment.locationId,
        estimatedWeightLbs: input.nextFulfillment.estimatedWeightLbs,
        estimatedWeightSource: input.nextFulfillment.estimatedWeightSource,
        version: input.nextFulfillmentVersion,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(orderSchema.orderFulfillments.id, input.current.fulfillment.id),
          eq(
            orderSchema.orderFulfillments.businessId,
            input.current.order.businessId,
          ),
          eq(
            orderSchema.orderFulfillments.version,
            input.current.fulfillment.version,
          ),
        ),
      )
      .returning({ id: orderSchema.orderFulfillments.id });

    if (updatedFulfillment === undefined)
      throw orderInvariantError(
        'FULFILLMENT_CORRECTION_LOCK_INVALID',
        'The locked fulfillment changed before the correction was stored.',
      );
  }

  await emitFulfillmentDemand(tx, {
    businessId: input.current.order.businessId,
    orderId: input.current.order.id,
    fulfillmentId: input.current.fulfillment.id,
    aggregateVersion: input.nextOrderVersion,
    displayNumber:
      input.changes.displayNumber === undefined
        ? input.current.order.displayNumber
        : input.changes.displayNumber,
    dueAt: input.changes.dueAt ?? input.current.order.dueAt,
    commercialState: input.current.order.state,
    fulfillment: input.nextFulfillment,
    now: input.now,
  });
};

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
  applyOrderCorrection: (input) => applyOrderCorrection(tx, input),
});

export const makePostgresCorrectOrderRepository = (
  db: Database,
): CorrectOrderRepository => defineUnitOfWork(db, operations);
