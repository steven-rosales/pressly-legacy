import { stateMachine } from '@pressly/kernel';
import type { FulfillmentReleaseState } from '../order-model/order.model.ts';
import type {
  ReleaseFulfillmentReasonCode,
  WithdrawFulfillmentReasonCode,
} from './change-fulfillment-release.port.ts';

export const releaseFulfillmentReasonCodes = [
  'ready_for_production',
  'manager_override',
] as const satisfies readonly ReleaseFulfillmentReasonCode[];

export const withdrawFulfillmentReasonCodes = [
  'commercial_canceled',
  'production_hold',
  'manager_override',
] as const satisfies readonly WithdrawFulfillmentReasonCode[];

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
