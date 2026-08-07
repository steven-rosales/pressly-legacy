import { stateMachine } from '@pressly/kernel';

export const accessGrantStates = ['active', 'revoked', 'expired'] as const;

export type AccessGrantState = (typeof accessGrantStates)[number];

export const accessGrantEvents = ['revoke', 'expire'] as const;

export type AccessGrantEvent = (typeof accessGrantEvents)[number];

type GrantEntity = Readonly<{ state: string }>;
type GrantEvent = Readonly<{ type: AccessGrantEvent }>;

const accessGrantMachine = stateMachine.define<
  typeof accessGrantStates,
  GrantEvent,
  GrantEntity,
  Record<string, never>
>({
  name: 'access-grant',
  states: accessGrantStates,
  initial: 'active',
  terminal: ['revoked', 'expired'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'active', on: 'revoke', to: 'revoked' },
    { from: 'active', on: 'expire', to: 'expired' },
  ],
});

export const accessGrantGraph = accessGrantMachine.graph;

export type AccessGrantDecision =
  | Readonly<{
      kind: 'allowed';
      from: AccessGrantState;
      to: AccessGrantState;
      event: AccessGrantEvent;
    }>
  | Readonly<{
      kind: 'denied';
      from: AccessGrantState;
      event: AccessGrantEvent;
      allowedEvents: readonly AccessGrantEvent[];
    }>;

export const decideAccessGrant = (
  current: AccessGrantState,
  event: AccessGrantEvent,
): AccessGrantDecision => {
  const transition = accessGrantMachine.transition(
    { state: current },
    { type: event },
    {},
  );

  if (transition.tag === 'err')
    return {
      kind: 'denied',
      from: current,
      event,
      allowedEvents: accessGrantMachine.allowedEvents(current),
    };

  return {
    kind: 'allowed',
    from: transition.value.from,
    to: transition.value.to,
    event: transition.value.event.type,
  };
};

export const allowedAccessGrantEvents = (
  state: AccessGrantState,
): readonly AccessGrantEvent[] => accessGrantMachine.allowedEvents(state);
