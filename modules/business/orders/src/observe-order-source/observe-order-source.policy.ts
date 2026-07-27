import { canonicalJson, result, type Result } from '@pressly/kernel';
import {
  fulfillmentReleaseAuthorityField,
  orderSourceFields,
} from '../order-field-authority.policy.ts';
import {
  mayTransitionFulfillment,
  mayTransitionOrder,
} from '../order-lifecycle.policy.ts';
import {
  decideOrderSourceRevision,
  mayOrderSourceWriteField,
} from '../order-source-ordering.policy.ts';
import type {
  FulfillmentReleaseState,
  ObserveOrderSourceCommand,
  OrderInput,
  OrderState,
} from '../orders.port.ts';
import type {
  ApplyOrderSourceAdoptionInput,
  StoredOrderSourceState,
} from './observe-order-source.port.ts';

export type OrderSourceUpdateDecision =
  | Readonly<{ kind: 'replay' }>
  | Readonly<{ kind: 'stale' }>
  | Readonly<{
      kind: 'observed_only';
      missingAuthorities: readonly string[];
    }>
  | (Readonly<{
      kind: 'apply';
      missingAuthorities: readonly string[];
    }> &
      Omit<ApplyOrderSourceAdoptionInput, 'current' | 'observedAt'>);

const sourceLifecycleForNewOrder = (
  observation: ObserveOrderSourceCommand,
): Readonly<{
  state: OrderState;
  releaseState: FulfillmentReleaseState;
}> => {
  const isPreHandoffCancellation =
    observation.state === 'canceled' &&
    observation.fulfillment.releaseState === 'withdrawn';
  if (isPreHandoffCancellation)
    return { state: 'canceled', releaseState: 'withdrawn' };

  const crossesHandoff =
    observation.state !== 'canceled' &&
    observation.fulfillment.releaseState === 'released';
  return {
    state: 'open',
    releaseState: crossesHandoff ? 'released' : 'unreleased',
  };
};

/**
 * A source can create prospective demand, cross the one-way fulfillment
 * handoff, or cancel before that handoff. Source completion is retained as
 * metadata but never creates a canonically completed Pressly Order.
 */
export const canonicalOrderForNewSource = (
  observation: ObserveOrderSourceCommand,
): OrderInput => {
  const lifecycle = sourceLifecycleForNewOrder(observation);
  return {
    customer: observation.customer,
    displayNumber: observation.displayNumber,
    state: lifecycle.state,
    dueAt: observation.dueAt,
    currency: observation.currency,
    totalAmountCents: observation.totalAmountCents,
    balanceDueCents: observation.balanceDueCents,
    items: observation.items,
    fulfillment: {
      ...observation.fulfillment,
      releaseState: lifecycle.releaseState,
    },
  };
};

const sourceLifecycleForExistingOrder = (input: {
  current: StoredOrderSourceState;
  observation: ObserveOrderSourceCommand;
  mayWriteOrderState: boolean;
  mayWriteReleaseState: boolean;
}): Readonly<{
  state: OrderState;
  releaseState: FulfillmentReleaseState;
}> => {
  const current = {
    state: input.current.order.state,
    releaseState: input.current.fulfillment.releaseState,
  };
  if (current.state !== 'open' || current.releaseState !== 'unreleased')
    return current;

  const cancellationRequested =
    input.mayWriteOrderState &&
    input.mayWriteReleaseState &&
    input.observation.state === 'canceled' &&
    input.observation.fulfillment.releaseState === 'withdrawn';
  if (
    cancellationRequested &&
    mayTransitionOrder(current.state, 'canceled') &&
    mayTransitionFulfillment(current.releaseState, 'withdrawn')
  )
    return { state: 'canceled', releaseState: 'withdrawn' };

  const handoffRequested =
    input.mayWriteReleaseState &&
    input.observation.state !== 'canceled' &&
    input.observation.fulfillment.releaseState === 'released';
  if (
    handoffRequested &&
    mayTransitionFulfillment(current.releaseState, 'released')
  )
    return { ...current, releaseState: 'released' };

  return current;
};

const sameDate = (left: Date, right: Date): boolean =>
  left.getTime() === right.getTime();

const sameOrder = (
  current: StoredOrderSourceState['order'],
  next: ApplyOrderSourceAdoptionInput['nextOrder'],
): boolean =>
  current.customerUserId === next.customerUserId &&
  current.customerResolution === next.customerResolution &&
  current.displayNumber === next.displayNumber &&
  current.state === next.state &&
  sameDate(current.dueAt, next.dueAt) &&
  current.currency === next.currency &&
  current.totalAmountCents === next.totalAmountCents &&
  current.balanceDueCents === next.balanceDueCents;

const sameFulfillment = (
  current: StoredOrderSourceState['fulfillment'],
  next: ApplyOrderSourceAdoptionInput['nextFulfillment'],
): boolean =>
  current.typeCode === next.typeCode &&
  current.locationId === next.locationId &&
  current.releaseState === next.releaseState &&
  current.estimatedWeightLbs === next.estimatedWeightLbs &&
  current.estimatedWeightSource === next.estimatedWeightSource &&
  current.bagCount === next.bagCount;

const canonicalItems = (items: StoredOrderSourceState['items']): string =>
  canonicalJson(
    [...items].sort((left, right) => left.lineKey.localeCompare(right.lineKey)),
  );

export const decideOrderSourceUpdate = (input: {
  current: StoredOrderSourceState;
  observation: ObserveOrderSourceCommand;
}): Result<OrderSourceUpdateDecision, 'source_conflict'> => {
  const revision = decideOrderSourceRevision(input.current.revision, {
    at: input.observation.revision.at,
    hash: input.observation.revision.hash,
  });
  if (revision.tag === 'err') return result.err('source_conflict');
  if (revision.value === 'replay' || revision.value === 'stale')
    return result.ok({ kind: revision.value });

  const allowed = (field: string) =>
    mayOrderSourceWriteField(
      input.current.authorities.get(field) ?? null,
      input.observation.source,
    );
  const releaseField = fulfillmentReleaseAuthorityField(
    input.current.fulfillment.typeCode,
  );
  const lifecycle = sourceLifecycleForExistingOrder({
    current: input.current,
    observation: input.observation,
    mayWriteOrderState: allowed('state'),
    mayWriteReleaseState: allowed(releaseField),
  });
  const nextOrder = {
    customerUserId: allowed('customer')
      ? input.observation.customer.userId
      : input.current.order.customerUserId,
    customerResolution: allowed('customer')
      ? input.observation.customer.resolution
      : input.current.order.customerResolution,
    displayNumber: allowed('displayNumber')
      ? input.observation.displayNumber
      : input.current.order.displayNumber,
    state: lifecycle.state,
    dueAt: allowed('dueAt')
      ? input.observation.dueAt
      : input.current.order.dueAt,
    currency: allowed('currency')
      ? input.observation.currency
      : input.current.order.currency,
    totalAmountCents: allowed('totalAmountCents')
      ? input.observation.totalAmountCents
      : input.current.order.totalAmountCents,
    balanceDueCents: allowed('balanceDueCents')
      ? input.observation.balanceDueCents
      : input.current.order.balanceDueCents,
  };
  const nextFulfillment = {
    ...input.observation.fulfillment,
    releaseState: lifecycle.releaseState,
  };
  const missingAuthorities = [...orderSourceFields, releaseField].filter(
    (field) => !input.current.authorities.has(field),
  );
  const canonicalChanged =
    !sameOrder(input.current.order, nextOrder) ||
    !sameFulfillment(input.current.fulfillment, nextFulfillment) ||
    canonicalItems(input.current.items) !==
      canonicalItems(input.observation.items);

  if (!canonicalChanged)
    return result.ok({ kind: 'observed_only', missingAuthorities });

  return result.ok({
    kind: 'apply',
    nextOrder,
    nextFulfillment,
    nextOrderVersion: input.current.order.version + 1,
    nextFulfillmentVersion: input.current.fulfillment.version + 1,
    items: input.observation.items,
    missingAuthorities,
  });
};
