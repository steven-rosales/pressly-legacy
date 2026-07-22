import { result, type Result } from '@pressly/kernel';
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
import type { ObserveOrderSourceCommand } from '../orders.port.ts';
import type {
  ApplyOrderSourceInput,
  StoredOrderSourceState,
} from './observe-order-source.port.ts';

export type OrderSourceUpdateDecision =
  | Readonly<{ kind: 'replay' }>
  | Readonly<{ kind: 'stale' }>
  | (Readonly<{ kind: 'apply' }> &
      Omit<ApplyOrderSourceInput, 'current' | 'observation' | 'items'>);

export const decideOrderSourceUpdate = (input: {
  current: StoredOrderSourceState;
  observation: ObserveOrderSourceCommand;
}): Result<
  OrderSourceUpdateDecision,
  'source_conflict' | 'invalid_transition'
> => {
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
  const targetOrderState = allowed('state')
    ? input.observation.state
    : input.current.order.state;
  const releaseField = fulfillmentReleaseAuthorityField(
    input.current.fulfillment.typeCode,
  );
  const targetReleaseState = allowed(releaseField)
    ? input.observation.fulfillment.releaseState
    : input.current.fulfillment.releaseState;
  if (
    !mayTransitionOrder(input.current.order.state, targetOrderState) ||
    !mayTransitionFulfillment(
      input.current.fulfillment.releaseState,
      targetReleaseState,
    )
  )
    return result.err('invalid_transition');

  return result.ok({
    kind: 'apply',
    nextOrder: {
      customerUserId: allowed('customer')
        ? input.observation.customer.userId
        : input.current.order.customerUserId,
      customerResolution: allowed('customer')
        ? input.observation.customer.resolution
        : input.current.order.customerResolution,
      displayNumber: allowed('displayNumber')
        ? input.observation.displayNumber
        : input.current.order.displayNumber,
      state: targetOrderState,
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
    },
    nextFulfillment: {
      ...input.observation.fulfillment,
      releaseState: targetReleaseState,
    },
    nextOrderVersion: input.current.order.version + 1,
    nextFulfillmentVersion: input.current.fulfillment.version + 1,
    missingAuthorities: [...orderSourceFields, releaseField].filter(
      (field) => !input.current.authorities.has(field),
    ),
  });
};
