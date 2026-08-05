import type { OrderState } from '../order/order.model.ts';
import { decideOrderLifecycle } from './order-lifecycle.lifecycle.ts';

export const mayTransitionOrder = (
  current: OrderState,
  target: OrderState,
): boolean => {
  if (current === target) return true;
  if (target === 'open') return false;
  return (
    decideOrderLifecycle(current, {
      type: target === 'completed' ? 'complete' : 'cancel',
    }).kind === 'allowed'
  );
};
