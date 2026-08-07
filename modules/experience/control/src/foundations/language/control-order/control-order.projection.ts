import type {
  ControlOrder,
  ControlOrderDetail,
  ControlOrderDetailSnapshot,
  ControlOrderSnapshot,
} from './control-order.model.ts';

export const toControlOrder = (order: ControlOrderSnapshot): ControlOrder => ({
  id: order.orderId,
  version: order.orderVersion,
  displayNumber: order.displayNumber,
  state: order.state,
  dueAt: order.dueAt.toISOString(),
  currency: order.currency,
  totalAmountCents: order.totalAmountCents,
  balanceDueCents: order.balanceDueCents,
  customer: order.customer,
  fulfillment: {
    id: order.fulfillmentId,
    version: order.fulfillmentVersion,
    ...order.fulfillment,
  },
  createdAt: order.createdAt.toISOString(),
  updatedAt: order.updatedAt.toISOString(),
});

export const toControlOrderDetail = (
  order: ControlOrderDetailSnapshot,
): ControlOrderDetail => ({
  ...toControlOrder(order),
  items: order.items,
});
