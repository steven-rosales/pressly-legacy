import { stateMachine } from '@pressly/kernel';
import type { OrderState } from '../order-model/order-model.port.ts';
import type {
  CancelOrderReasonCode,
  CompleteOrderReasonCode,
} from './change-order-lifecycle.port.ts';

export const completeOrderReasonCodes = [
  'service_completed',
  'manager_correction',
] as const satisfies readonly CompleteOrderReasonCode[];

export const cancelOrderReasonCodes = [
  'customer_canceled',
  'duplicate_order',
  'created_in_error',
  'manager_correction',
] as const satisfies readonly CancelOrderReasonCode[];

type OrderEntity = Readonly<{ state: string }>;
export type OrderLifecycleEvent =
  | Readonly<{ type: 'complete' }>
  | Readonly<{ type: 'cancel' }>;

const orderMachine = stateMachine.define<
  readonly ['open', 'completed', 'canceled'],
  OrderLifecycleEvent,
  OrderEntity,
  Record<string, never>
>({
  name: 'commercial-order',
  states: ['open', 'completed', 'canceled'],
  initial: 'open',
  terminal: ['completed', 'canceled'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'open', on: 'complete', to: 'completed' },
    { from: 'open', on: 'cancel', to: 'canceled' },
  ],
});

export type OrderLifecycleDecision =
  | Readonly<{
      kind: 'allowed';
      from: OrderState;
      to: OrderState;
      event: OrderLifecycleEvent['type'];
    }>
  | Readonly<{
      kind: 'denied';
      from: OrderState;
      event: OrderLifecycleEvent['type'];
      allowedEvents: readonly OrderLifecycleEvent['type'][];
    }>;

export const decideOrderLifecycle = (
  current: OrderState,
  event: OrderLifecycleEvent,
): OrderLifecycleDecision => {
  const transition = orderMachine.transition({ state: current }, event, {});
  return transition.tag === 'ok'
    ? {
        kind: 'allowed',
        from: transition.value.from,
        to: transition.value.to,
        event: transition.value.event.type,
      }
    : {
        kind: 'denied',
        from: current,
        event: event.type,
        allowedEvents: orderMachine.allowedEvents(current),
      };
};

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
