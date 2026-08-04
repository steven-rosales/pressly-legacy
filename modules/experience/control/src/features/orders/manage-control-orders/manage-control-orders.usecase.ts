import { result, type Result } from '@pressly/kernel';
import type { ControlRequestContext } from '../../../foundations/language/control-context/control-context.value.ts';
import type {
  ControlOrderDetail,
  ControlOrderList,
  ControlOrderMutation,
} from '../../../foundations/language/control-order/control-order.model.ts';
import type {
  ControlDirectCustomerInput,
  ControlOrderCustomerReference,
  ControlOrderFulfillmentInput,
  ControlOrderItem,
  ControlOrderState,
} from '../../../foundations/language/control-order/control-order.value.ts';
import type {
  ControlOrderRejection,
  ControlOrdersPort,
} from '../../../foundations/ports/control-orders/control-orders.port.ts';
import type { ControlLocationFailure } from './control-location.failure.ts';
import { resolveControlLocationIds } from './control-location.policy.ts';
import {
  toControlOrder,
  toControlOrderDetail,
} from './control-order.projection.mapper.ts';

export type ControlOrderFailure =
  | ControlOrderRejection
  | ControlLocationFailure;

type OrderResult<Value> = Promise<Result<Value, ControlOrderFailure>>;
const directCustomer = (
  customer: ControlDirectCustomerInput,
): ControlOrderCustomerReference =>
  customer.resolution === 'resolved'
    ? {
        resolution: 'resolved',
        userId: customer.userId,
        externalUserId: null,
      }
    : {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      };

export type ControlOrdersApplication = Readonly<{
  list: (input: {
    context: ControlRequestContext;
    query?: string;
    state?: ControlOrderState;
    locationId?: string;
    cursor?: string;
    limit: number;
  }) => OrderResult<ControlOrderList>;
  get: (input: {
    context: ControlRequestContext;
    orderId: string;
  }) => OrderResult<ControlOrderDetail>;
  create: (input: {
    context: ControlRequestContext;
    idempotencyKey: string;
    reasonCode: 'new_customer_order' | 'recovery_entry';
    reasonNote: string | null;
    customer: ControlDirectCustomerInput;
    displayNumber: string | null;
    dueAt: string;
    currency: string;
    totalAmountCents: number;
    balanceDueCents: number | null;
    items: readonly ControlOrderItem[];
    fulfillment: ControlOrderFulfillmentInput;
  }) => OrderResult<ControlOrderMutation>;
  correct: (input: {
    context: ControlRequestContext;
    orderId: string;
    idempotencyKey: string;
    reasonCode:
      | 'customer_correction'
      | 'manager_correction'
      | 'source_discrepancy';
    reasonNote: string | null;
    expectedOrderVersion: number;
    expectedFulfillmentVersion: number;
    changes: Readonly<{
      customer?: ControlDirectCustomerInput;
      displayNumber?: string | null;
      dueAt?: string;
      currency?: string;
      totalAmountCents?: number;
      balanceDueCents?: number | null;
      items?: readonly ControlOrderItem[];
      fulfillment?: Readonly<{
        typeCode?: string;
        locationId?: string;
        estimatedWeight?: Readonly<{
          lbs: number | null;
          source: string | null;
        }>;
      }>;
    }>;
  }) => OrderResult<ControlOrderMutation>;
}>;

export const makeControlOrdersApplication = (
  orders: ControlOrdersPort,
): ControlOrdersApplication => ({
  list: async ({ context, ...query }) => {
    const locations = resolveControlLocationIds(
      context.access,
      query.locationId,
    );
    if (result.isErr(locations)) return locations;
    const page = await orders.list({
      businessId: context.access.business.id,
      locationIds: locations.value,
      query: query.query ?? null,
      state: query.state ?? null,
      limit: query.limit,
      cursor: query.cursor ?? null,
    });
    return result.isErr(page)
      ? page
      : result.ok({
          items: page.value.items.map(toControlOrder),
          nextCursor: page.value.nextCursor,
        });
  },
  get: async ({ context, orderId }) => {
    const locations = resolveControlLocationIds(context.access);
    if (result.isErr(locations)) return locations;
    const order = await orders.get({
      businessId: context.access.business.id,
      locationIds: locations.value,
      orderId,
    });
    return result.isErr(order)
      ? order
      : result.ok(toControlOrderDetail(order.value));
  },
  create: async ({ context, ...command }) => {
    const locations = resolveControlLocationIds(
      context.access,
      command.fulfillment.locationId,
    );
    if (result.isErr(locations)) return locations;
    const created = await orders.create({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
      customer: directCustomer(command.customer),
      dueAt: new Date(command.dueAt),
    });
    return created;
  },
  correct: async ({ context, orderId, ...command }) => {
    const locations = resolveControlLocationIds(context.access);
    if (result.isErr(locations)) return locations;
    const current = await orders.get({
      businessId: context.access.business.id,
      locationIds: locations.value,
      orderId,
    });
    if (result.isErr(current)) return current;
    const { customer, dueAt, ...remainingChanges } = command.changes;
    const corrected = await orders.correct({
      ...command,
      businessId: context.access.business.id,
      context: context.command,
      locationId: current.value.fulfillment.locationId,
      orderId,
      changes: {
        ...remainingChanges,
        ...(customer === undefined
          ? {}
          : { customer: directCustomer(customer) }),
        ...(dueAt === undefined ? {} : { dueAt: new Date(dueAt) }),
      },
    });
    return corrected;
  },
});
