import {
  canonicalJson,
  decodeBase64UrlJson,
  encodeBase64UrlText,
  isJsonObject,
} from '@pressly/codec';
import { canonicalSha256 } from '@pressly/codec/node';
import { invariantViolationError } from '@pressly/errors/factories';
import { isCommandContextValid } from '@pressly/cells/command-context';
import {
  areOrderItemsValid,
  isEstimatedWeightValid,
  type OrderItemInput,
} from '../order-input.ts';
import type {
  CanonicalOrderSummary,
  FulfillmentInput,
  FulfillmentReleaseState,
  OrderAggregate,
  OrderCustomer,
  OrderState,
} from './model.ts';

export const hashOrderCommand = (command: unknown): string =>
  canonicalSha256(command);

const noteRequiredReasonCodes = new Set<string>([
  'recovery_entry',
  'manager_correction',
  'source_discrepancy',
  'manager_override',
  'production_hold',
]);

export const isOrderCommandReasonValid = <ReasonCode extends string>(input: {
  reasonCode: string;
  reasonNote: string | null;
  allowedReasonCodes: readonly ReasonCode[];
}): boolean => {
  const note = input.reasonNote?.trim() ?? null;
  return (
    input.allowedReasonCodes.some((code) => code === input.reasonCode) &&
    (note === null || (note.length > 0 && note.length <= 1_000)) &&
    (!noteRequiredReasonCodes.has(input.reasonCode) || note !== null)
  );
};

export const isCanonicalOrderInputValid = (input: {
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: FulfillmentInput;
}): boolean =>
  !Number.isNaN(input.dueAt.getTime()) &&
  /^[A-Z]{3}$/.test(input.currency) &&
  Number.isInteger(input.totalAmountCents) &&
  input.totalAmountCents >= 0 &&
  (input.balanceDueCents === null ||
    (Number.isInteger(input.balanceDueCents) && input.balanceDueCents >= 0)) &&
  input.fulfillment.typeCode.trim() !== '' &&
  input.fulfillment.locationId.trim() !== '' &&
  isEstimatedWeightValid({
    lbs: input.fulfillment.estimatedWeightLbs,
    source: input.fulfillment.estimatedWeightSource,
  }) &&
  areOrderItemsValid(input.items);

export const isAuditedOrderCommandValid = (
  command: Readonly<{
    businessId: string;
    idempotencyKey: string;
    context: Parameters<typeof isCommandContextValid>[0];
    reasonCode: string;
    reasonNote: string | null;
  }>,
  reasonCodes: readonly string[],
): boolean =>
  command.businessId.trim() !== '' &&
  command.idempotencyKey.trim() !== '' &&
  isCommandContextValid(command.context) &&
  isOrderCommandReasonValid({
    reasonCode: command.reasonCode,
    reasonNote: command.reasonNote,
    allowedReasonCodes: reasonCodes,
  });

export const decideOrderLifecycle = (
  current: OrderState,
  event: 'complete' | 'cancel',
) =>
  current === 'open'
    ? ({
        kind: 'allowed',
        from: current,
        to: event === 'complete' ? 'completed' : 'canceled',
        event,
      } as const)
    : ({ kind: 'denied', from: current, event, allowedEvents: [] } as const);

export const decideFulfillmentRelease = (
  current: FulfillmentReleaseState,
  event: 'release' | 'withdraw',
) => {
  if (current === 'unreleased')
    return {
      kind: 'allowed',
      from: current,
      to: event === 'release' ? 'released' : 'withdrawn',
      event,
    } as const;
  if (current === 'released' && event === 'withdraw')
    return {
      kind: 'allowed',
      from: current,
      to: 'withdrawn',
      event,
    } as const;
  return { kind: 'denied', from: current, event, allowedEvents: [] } as const;
};

export type FulfillmentDescriptionCorrection = Readonly<{
  typeCode?: string;
  locationId?: string;
  estimatedWeight?: Readonly<{ lbs: number | null; source: string | null }>;
}>;

export type OrderDescriptionCorrection = Readonly<{
  customer?: OrderCustomer;
  displayNumber?: string | null;
  dueAt?: Date;
  currency?: string;
  totalAmountCents?: number;
  balanceDueCents?: number | null;
  items?: readonly OrderItemInput[];
  fulfillment?: FulfillmentDescriptionCorrection;
}>;

const isCustomerValid = (customer: OrderCustomer): boolean => {
  if (customer.resolution === 'resolved') return customer.userId.trim() !== '';
  if (customer.userId !== null) return false;
  if (customer.resolution === 'pending' || customer.resolution === 'conflict')
    return customer.externalUserId.trim() !== '';
  return true;
};

export const decideOrderCorrection = (input: {
  current: OrderAggregate;
  locationScope: string;
  changes: OrderDescriptionCorrection;
}):
  | Readonly<{
      kind: 'allowed';
      nextFulfillment: FulfillmentInput;
      fulfillmentChanged: boolean;
    }>
  | Readonly<{
      kind: 'denied';
      reason: 'invalid' | 'location_move' | 'fulfillment_committed';
    }> => {
  const { changes } = input;
  const fulfillment = changes.fulfillment;
  if (
    Object.keys(changes).length === 0 ||
    (changes.customer !== undefined && !isCustomerValid(changes.customer)) ||
    (changes.displayNumber !== undefined &&
      changes.displayNumber !== null &&
      changes.displayNumber.trim() === '') ||
    (changes.dueAt !== undefined && Number.isNaN(changes.dueAt.getTime())) ||
    (changes.currency !== undefined && !/^[A-Z]{3}$/.test(changes.currency)) ||
    (changes.totalAmountCents !== undefined &&
      (!Number.isInteger(changes.totalAmountCents) ||
        changes.totalAmountCents < 0)) ||
    (changes.balanceDueCents !== undefined &&
      changes.balanceDueCents !== null &&
      (!Number.isInteger(changes.balanceDueCents) ||
        changes.balanceDueCents < 0)) ||
    (changes.items !== undefined && !areOrderItemsValid(changes.items)) ||
    (fulfillment !== undefined &&
      (Object.keys(fulfillment).length === 0 ||
        (fulfillment.typeCode !== undefined &&
          fulfillment.typeCode.trim() === '') ||
        (fulfillment.locationId !== undefined &&
          fulfillment.locationId.trim() === '') ||
        (fulfillment.estimatedWeight !== undefined &&
          !isEstimatedWeightValid(fulfillment.estimatedWeight))))
  )
    return { kind: 'denied', reason: 'invalid' };

  if (
    fulfillment?.locationId !== undefined &&
    fulfillment.locationId !== input.locationScope
  )
    return { kind: 'denied', reason: 'location_move' };

  const nextFulfillment: FulfillmentInput = {
    ...input.current.fulfillment,
    ...(fulfillment?.typeCode === undefined
      ? {}
      : { typeCode: fulfillment.typeCode }),
    ...(fulfillment?.locationId === undefined
      ? {}
      : { locationId: fulfillment.locationId }),
    ...(fulfillment?.estimatedWeight === undefined
      ? {}
      : {
          estimatedWeightLbs: fulfillment.estimatedWeight.lbs,
          estimatedWeightSource: fulfillment.estimatedWeight.source,
        }),
  };
  const identityChanged =
    nextFulfillment.typeCode !== input.current.fulfillment.typeCode ||
    nextFulfillment.locationId !== input.current.fulfillment.locationId;
  if (
    identityChanged &&
    input.current.fulfillment.releaseState !== 'unreleased'
  )
    return { kind: 'denied', reason: 'fulfillment_committed' };

  return {
    kind: 'allowed',
    nextFulfillment,
    fulfillmentChanged:
      nextFulfillment.typeCode !== input.current.fulfillment.typeCode ||
      nextFulfillment.locationId !== input.current.fulfillment.locationId ||
      nextFulfillment.estimatedWeightLbs !==
        input.current.fulfillment.estimatedWeightLbs ||
      nextFulfillment.estimatedWeightSource !==
        input.current.fulfillment.estimatedWeightSource,
  };
};

type CustomerProjection = Readonly<{
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}> | null;

const customerDisplayName = (customer: CustomerProjection): string | null => {
  if (customer === null) return null;
  const business = customer.businessName?.trim();
  if (business !== undefined && business !== '') return business;
  const person = [customer.firstName, customer.lastName]
    .filter((part): part is string => part !== null && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  return person === '' ? null : person;
};

export const projectCanonicalOrderSummary = (source: {
  order: {
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
    customerId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  fulfillment: {
    id: string;
    version: number;
    typeCode: string;
    locationId: string;
    releaseState: string;
    estimatedWeightLbs: number | null;
    estimatedWeightSource: string | null;
    updatedAt: Date;
  };
  customer: CustomerProjection;
}): CanonicalOrderSummary => {
  if (
    source.order.state !== 'open' &&
    source.order.state !== 'completed' &&
    source.order.state !== 'canceled'
  )
    throw invariantViolationError({
      code: 'order_read_model_invalid',
      message: 'Stored Order query data contains an invalid lifecycle value.',
      safeMessage: 'Stored order data is inconsistent.',
    });
  if (
    source.order.customerResolution !== 'resolved' &&
    source.order.customerResolution !== 'not_provided' &&
    source.order.customerResolution !== 'pending' &&
    source.order.customerResolution !== 'conflict'
  )
    throw invariantViolationError({
      code: 'order_read_model_invalid',
      message: 'Stored Order query data contains an invalid lifecycle value.',
      safeMessage: 'Stored order data is inconsistent.',
    });
  if (
    source.fulfillment.releaseState !== 'unreleased' &&
    source.fulfillment.releaseState !== 'released' &&
    source.fulfillment.releaseState !== 'withdrawn'
  )
    throw invariantViolationError({
      code: 'order_read_model_invalid',
      message: 'Stored Order query data contains an invalid lifecycle value.',
      safeMessage: 'Stored order data is inconsistent.',
    });

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
      userId: source.order.customerId,
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
    },
    createdAt: source.order.createdAt,
    updatedAt:
      source.order.updatedAt > source.fulfillment.updatedAt
        ? source.order.updatedAt
        : source.fulfillment.updatedAt,
  };
};

export type OrderCursor = Readonly<{ dueAt: Date; id: string }>;
type OrderCursorFilter = Readonly<{
  businessId: string;
  locationIds: readonly string[];
  query: string | null;
  state: OrderState | null;
}>;

const orderCursorFilterKey = (input: OrderCursorFilter): string =>
  canonicalJson({
    businessId: input.businessId,
    locationIds: [...input.locationIds].sort(),
    query: input.query?.trim().toLocaleLowerCase() ?? null,
    state: input.state,
  });

export const encodeOrderCursor = (
  filter: OrderCursorFilter,
  cursor: OrderCursor,
): string =>
  encodeBase64UrlText(
    canonicalJson({
      version: 1,
      filter: orderCursorFilterKey(filter),
      dueAt: cursor.dueAt.toISOString(),
      id: cursor.id,
    }),
  );

export const decodeOrderCursor = (
  filter: OrderCursorFilter,
  cursor: string,
): OrderCursor | null => {
  const parsed = decodeBase64UrlJson(cursor);
  if (
    !isJsonObject(parsed) ||
    parsed['version'] !== 1 ||
    parsed['filter'] !== orderCursorFilterKey(filter) ||
    typeof parsed['dueAt'] !== 'string' ||
    typeof parsed['id'] !== 'string'
  )
    return null;
  const dueAt = new Date(parsed['dueAt']);
  return Number.isNaN(dueAt.getTime()) ? null : { dueAt, id: parsed['id'] };
};
