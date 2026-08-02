import type { FulfillmentInput } from '../order-model/order.model.ts';
import type { StoredOrderAggregate } from '../persistence/order-aggregate.port.ts';
import {
  areOrderItemsValid,
  isEstimatedWeightValid,
} from '../order-model/order-input.policy.ts';
import type {
  CorrectOrderCommand,
  CorrectOrderReasonCode,
} from './correct-order.port.ts';

export const correctOrderReasonCodes = [
  'customer_correction',
  'manager_correction',
  'source_discrepancy',
] as const satisfies readonly CorrectOrderReasonCode[];

export type OrderCorrectionDecision =
  | Readonly<{
      kind: 'allowed';
      nextFulfillment: FulfillmentInput;
      fulfillmentChanged: boolean;
    }>
  | Readonly<{
      kind: 'denied';
      reason: 'invalid' | 'location_move' | 'fulfillment_committed';
    }>;

const isCustomerValid = (
  customer: NonNullable<CorrectOrderCommand['changes']['customer']>,
): boolean => {
  if (customer.resolution === 'resolved') return customer.userId.trim() !== '';
  if (customer.userId !== null) return false;
  if (customer.resolution === 'pending' || customer.resolution === 'conflict')
    return customer.externalUserId.trim() !== '';
  return true;
};

export const decideOrderCorrection = (input: {
  current: StoredOrderAggregate;
  locationScope: string;
  changes: CorrectOrderCommand['changes'];
}): OrderCorrectionDecision => {
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

  // Reassigning a fulfillment crosses an authorization and operational
  // boundary. This command may only assert the location protected by its
  // route scope.
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
