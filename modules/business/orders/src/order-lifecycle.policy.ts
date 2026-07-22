import { stateMachine } from '@pressly/kernel';
import type { FulfillmentReleaseState, OrderState } from './orders.port.ts';

type OrderEntity = Readonly<{ state: string }>;
type OrderEvent = Readonly<{ type: 'complete' }> | Readonly<{ type: 'cancel' }>;

const orderMachine = stateMachine.define<
  readonly ['open', 'completed', 'canceled'],
  OrderEvent,
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
type FulfillmentEvent =
  | Readonly<{ type: 'release' }>
  | Readonly<{ type: 'withdraw' }>;

const fulfillmentMachine = stateMachine.define<
  readonly ['unreleased', 'released', 'withdrawn'],
  FulfillmentEvent,
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

export const mayTransitionOrder = (
  current: OrderState,
  target: OrderState,
): boolean => {
  if (current === target) return true;
  if (target === 'open') return false;
  return orderMachine.can(
    { state: current },
    { type: target === 'completed' ? 'complete' : 'cancel' },
    {},
  );
};

export const mayTransitionFulfillment = (
  current: FulfillmentReleaseState,
  target: FulfillmentReleaseState,
): boolean => {
  if (current === target) return true;
  if (target === 'unreleased') return false;
  return fulfillmentMachine.can(
    { state: current },
    { type: target === 'released' ? 'release' : 'withdraw' },
    {},
  );
};
