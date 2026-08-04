import type { StoredOrderCommandReceipt } from '../../../language/command-execution/order-command-receipt.model.ts';
import type {
  Fulfillment,
  Order,
} from '../../../language/order/order.entity.ts';
import type {
  FulfillmentReleaseState,
  OrderCustomer,
  OrderItemInput,
  OrderState,
} from '../../../language/order/order.model.ts';
import { orderPersistenceInvariant } from './order-store.error.ts';

const orderStates: ReadonlySet<string> = new Set([
  'open',
  'completed',
  'canceled',
]);
const releaseStates: ReadonlySet<string> = new Set([
  'unreleased',
  'released',
  'withdrawn',
]);
const customerResolutions: ReadonlySet<string> = new Set([
  'resolved',
  'not_provided',
  'pending',
  'conflict',
  'legacy_unknown',
]);

const isOrderState = (value: string): value is OrderState =>
  orderStates.has(value);

const isFulfillmentReleaseState = (
  value: string,
): value is FulfillmentReleaseState => releaseStates.has(value);

const isOrderCustomerResolution = (
  value: string,
): value is OrderCustomer['resolution'] => customerResolutions.has(value);

export const customerColumns = (customer: OrderCustomer) => ({
  customerUserId: customer.userId,
  customerResolution: customer.resolution,
});

export const storedOrderCommandReceiptFromRow = (row: {
  commandHash: string;
  result: unknown;
}): StoredOrderCommandReceipt => {
  const stored = row.result;
  if (
    stored === null ||
    typeof stored !== 'object' ||
    !('orderId' in stored) ||
    !('fulfillmentId' in stored) ||
    !('version' in stored) ||
    typeof stored.orderId !== 'string' ||
    typeof stored.fulfillmentId !== 'string' ||
    typeof stored.version !== 'number'
  )
    throw orderPersistenceInvariant(
      'ORDER_COMMAND_RECEIPT_INVALID',
      'Stored order command result is invalid.',
    );

  return {
    commandHash: row.commandHash,
    result: {
      orderId: stored.orderId,
      fulfillmentId: stored.fulfillmentId,
      version: stored.version,
      replayed: false,
    },
  };
};

export const storedOrderFromRow = (row: {
  id: string;
  businessId: string;
  version: number;
  customerUserId: string | null;
  customerResolution: string;
  displayNumber: string | null;
  state: string;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
}): Order => {
  if (!isOrderState(row.state))
    throw orderPersistenceInvariant(
      'ORDER_STATE_INVALID',
      'Stored Order state is invalid.',
    );
  if (!isOrderCustomerResolution(row.customerResolution))
    throw orderPersistenceInvariant(
      'ORDER_CUSTOMER_RESOLUTION_INVALID',
      'Stored Order customer resolution is invalid.',
    );

  return {
    ...row,
    state: row.state,
    customerResolution: row.customerResolution,
  };
};

export const storedFulfillmentFromRow = (row: {
  id: string;
  businessId: string;
  orderId: string;
  version: number;
  typeCode: string;
  locationId: string;
  releaseState: string;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
}): Fulfillment => {
  if (!isFulfillmentReleaseState(row.releaseState))
    throw orderPersistenceInvariant(
      'FULFILLMENT_RELEASE_STATE_INVALID',
      'Stored Fulfillment release state is invalid.',
    );

  return {
    ...row,
    releaseState: row.releaseState,
  };
};

export const storedOrderItemFromRow = (row: {
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
    throw orderPersistenceInvariant(
      'ORDER_ITEM_SOURCE_METADATA_INVALID',
      'Stored order item source metadata is not a JSON object.',
    );

  return { ...row, sourceMetadata: row.sourceMetadata };
};
import { isJsonObject } from '@pressly/codec';
