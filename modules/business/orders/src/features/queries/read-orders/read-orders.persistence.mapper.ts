import { isJsonObject } from '@pressly/codec';
import type * as orderSchema from '@pressly/db/schema/orders';
import type * as userSchema from '@pressly/db/schema/users';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderItemInput,
  OrderState,
} from '../../../foundations/language/order/order.model.ts';
import type { CanonicalOrderSummary } from './read-orders.port.ts';

type ReadOrderRow = Readonly<{
  order: typeof orderSchema.orders.$inferSelect;
  fulfillment: typeof orderSchema.orderFulfillments.$inferSelect;
  customer: typeof userSchema.users.$inferSelect | null;
}>;

const isOrderState = (value: string): value is OrderState =>
  value === 'open' || value === 'completed' || value === 'canceled';

const isFulfillmentReleaseState = (
  value: string,
): value is FulfillmentReleaseState =>
  value === 'unreleased' || value === 'released' || value === 'withdrawn';

const isOrderCustomerResolution = (
  value: string,
): value is OrderCustomer['resolution'] =>
  value === 'resolved' ||
  value === 'not_provided' ||
  value === 'pending' ||
  value === 'conflict' ||
  value === 'legacy_unknown';

const customerDisplayName = (
  row: typeof userSchema.users.$inferSelect | null,
): string | null => {
  if (row === null) return null;
  const business = row.businessName?.trim();
  if (business !== undefined && business !== '') return business;
  const person = [row.firstName, row.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return person === '' ? null : person;
};

export const canonicalOrderSummaryFromRows = (
  row: ReadOrderRow,
): CanonicalOrderSummary => {
  if (
    !isOrderState(row.order.state) ||
    !isOrderCustomerResolution(row.order.customerResolution) ||
    !isFulfillmentReleaseState(row.fulfillment.releaseState)
  )
    throw orderInvariantError(
      'ORDER_READ_MODEL_INVALID',
      'Stored Order query data contains an invalid lifecycle value.',
    );

  return {
    orderId: row.order.id,
    businessId: row.order.businessId,
    orderVersion: row.order.version,
    fulfillmentId: row.fulfillment.id,
    fulfillmentVersion: row.fulfillment.version,
    displayNumber: row.order.displayNumber,
    state: row.order.state,
    dueAt: row.order.dueAt,
    currency: row.order.currency,
    totalAmountCents: row.order.totalAmountCents,
    balanceDueCents: row.order.balanceDueCents,
    customer: {
      resolution: row.order.customerResolution,
      userId: row.order.customerUserId,
      displayName: customerDisplayName(row.customer),
      phone: row.customer?.phone ?? null,
      email: row.customer?.email ?? null,
    },
    fulfillment: {
      typeCode: row.fulfillment.typeCode,
      locationId: row.fulfillment.locationId,
      releaseState: row.fulfillment.releaseState,
      estimatedWeightLbs: row.fulfillment.estimatedWeightLbs,
      estimatedWeightSource: row.fulfillment.estimatedWeightSource,
      bagCount: row.fulfillment.bagCount,
    },
    createdAt: row.order.createdAt,
    updatedAt:
      row.order.updatedAt > row.fulfillment.updatedAt
        ? row.order.updatedAt
        : row.fulfillment.updatedAt,
  };
};

export const canonicalOrderItemFromRow = (row: {
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: unknown;
}): OrderItemInput => {
  if (!isJsonObject(row.sourceMetadata))
    throw orderInvariantError(
      'ORDER_ITEM_SOURCE_METADATA_INVALID',
      'Stored Order item source metadata is not a JSON object.',
    );

  return { ...row, sourceMetadata: row.sourceMetadata };
};
