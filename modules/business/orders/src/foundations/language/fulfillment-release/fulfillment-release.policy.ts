import type { FulfillmentReleaseState } from '../order/order.model.ts';
import { decideFulfillmentRelease } from './fulfillment-release.lifecycle.ts';

export const mayTransitionFulfillment = (
  current: FulfillmentReleaseState,
  target: FulfillmentReleaseState,
): boolean => {
  if (current === target) return true;
  if (target === 'unreleased') return false;
  return (
    decideFulfillmentRelease(current, {
      type: target === 'released' ? 'release' : 'withdraw',
    }).kind === 'allowed'
  );
};
