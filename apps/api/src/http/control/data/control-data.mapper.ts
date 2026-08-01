import type {
  CanonicalOrderDetail,
  CanonicalOrderSummary,
} from '@pressly/orders';
import type { UserSummary } from '@pressly/users';

export const controlCustomer = (customer: UserSummary) => ({
  id: customer.id,
  version: customer.version,
  active: customer.active,
  firstName: customer.firstName,
  lastName: customer.lastName,
  businessName: customer.businessName,
  phone: customer.phone,
  email: customer.email,
  displayName: customer.displayName,
  possibleDuplicateCount: customer.possibleDuplicateCount,
  createdAt: customer.createdAt.toISOString(),
  updatedAt: customer.updatedAt.toISOString(),
});

export const controlOrder = (order: CanonicalOrderSummary) => ({
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

export const controlOrderDetail = (order: CanonicalOrderDetail) => ({
  ...controlOrder(order),
  items: order.items,
});
