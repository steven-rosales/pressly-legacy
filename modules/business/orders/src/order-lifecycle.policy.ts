import { stateMachine } from '@pressly/kernel';
import type { FulfillmentReleaseState, OrderState } from './orders.port.ts';

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

type FulfillmentEntity = Readonly<{ state: string }>;
export type FulfillmentReleaseEvent =
  | Readonly<{ type: 'release' }>
  | Readonly<{ type: 'withdraw' }>;

const fulfillmentMachine = stateMachine.define<
  readonly ['unreleased', 'released', 'withdrawn'],
  FulfillmentReleaseEvent,
  FulfillmentEntity,
  Record<string, never>
>({
  name: 'fulfillment-release',
  states: ['unreleased', 'released', 'withdrawn'],
  initial: 'unreleased',
  terminal: ['withdrawn'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'unreleased', on: 'release', to: 'released' },
    { from: ['unreleased', 'released'], on: 'withdraw', to: 'withdrawn' },
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

export type FulfillmentReleaseDecision =
  | Readonly<{
      kind: 'allowed';
      from: FulfillmentReleaseState;
      to: FulfillmentReleaseState;
      event: FulfillmentReleaseEvent['type'];
    }>
  | Readonly<{
      kind: 'denied';
      from: FulfillmentReleaseState;
      event: FulfillmentReleaseEvent['type'];
      allowedEvents: readonly FulfillmentReleaseEvent['type'][];
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

export const decideFulfillmentRelease = (
  current: FulfillmentReleaseState,
  event: FulfillmentReleaseEvent,
): FulfillmentReleaseDecision => {
  const transition = fulfillmentMachine.transition(
    { state: current },
    event,
    {},
  );
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
        allowedEvents: fulfillmentMachine.allowedEvents(current),
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
