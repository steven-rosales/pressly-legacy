import { orderInvariantError } from '../order/order-invariant.error.ts';
import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderState,
} from '../order/order.model.ts';
import type { CanonicalOrderSummary } from './canonical-order-read.model.ts';

type CanonicalOrderSummarySource = Readonly<{
  order: Readonly<{
    id: string;
    businessId: string;
    version: number;
    displayNumber: string | null;
    state: string;
    dueAt: Date;
    currency: string;
    totalAmountCents: number;
    balanceDueCents: number | null;
    customerResolution: string;
    customerUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  fulfillment: Readonly<{
    id: string;
    version: number;
    typeCode: string;
    locationId: string;
    releaseState: string;
    estimatedWeightLbs: number | null;
    estimatedWeightSource: string | null;
    bagCount: number | null;
    updatedAt: Date;
  }>;
  customer: Readonly<{
    firstName: string | null;
    lastName: string | null;
    businessName: string | null;
    phone: string | null;
    email: string | null;
  }> | null;
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
  customer: CanonicalOrderSummarySource['customer'],
): string | null => {
  if (customer === null) return null;
  const business = customer.businessName?.trim();
  if (business !== undefined && business !== '') return business;

  const person = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');

  return person === '' ? null : person;
};

export const projectCanonicalOrderSummary = (
  source: CanonicalOrderSummarySource,
): CanonicalOrderSummary => {
  if (
    !isOrderState(source.order.state) ||
    !isOrderCustomerResolution(source.order.customerResolution) ||
    !isFulfillmentReleaseState(source.fulfillment.releaseState)
  )
    throw orderInvariantError(
      'ORDER_READ_MODEL_INVALID',
      'Stored Order query data contains an invalid lifecycle value.',
    );

  return {
    orderId: source.order.id,
    businessId: source.order.businessId,
    orderVersion: source.order.version,
    fulfillmentId: source.fulfillment.id,
    fulfillmentVersion: source.fulfillment.version,
    displayNumber: source.order.displayNumber,
    state: source.order.state,
    dueAt: source.order.dueAt,
    currency: source.order.currency,
    totalAmountCents: source.order.totalAmountCents,
    balanceDueCents: source.order.balanceDueCents,
    customer: {
      resolution: source.order.customerResolution,
      userId: source.order.customerUserId,
      displayName: customerDisplayName(source.customer),
      phone: source.customer?.phone ?? null,
      email: source.customer?.email ?? null,
    },
    fulfillment: {
      typeCode: source.fulfillment.typeCode,
      locationId: source.fulfillment.locationId,
      releaseState: source.fulfillment.releaseState,
      estimatedWeightLbs: source.fulfillment.estimatedWeightLbs,
      estimatedWeightSource: source.fulfillment.estimatedWeightSource,
      bagCount: source.fulfillment.bagCount,
    },
    createdAt: source.order.createdAt,
    updatedAt:
      source.order.updatedAt > source.fulfillment.updatedAt
        ? source.order.updatedAt
        : source.fulfillment.updatedAt,
  };
};
