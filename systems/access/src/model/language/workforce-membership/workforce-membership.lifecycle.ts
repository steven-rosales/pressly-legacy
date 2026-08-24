import * as stateMachine from '@pressly/cells/state-machine';

export const workforceMembershipStates = [
  'active',
  'suspended',
  'ended',
] as const;

export type WorkforceMembershipState =
  (typeof workforceMembershipStates)[number];

export const workforceMembershipEvents = [
  'suspend',
  'reactivate',
  'end',
] as const;

export type WorkforceMembershipEvent =
  (typeof workforceMembershipEvents)[number];

type MembershipEntity = Readonly<{ state: string }>;
type MembershipEvent = Readonly<{ type: WorkforceMembershipEvent }>;

const membershipMachine = stateMachine.define<
  typeof workforceMembershipStates,
  MembershipEvent,
  MembershipEntity,
  Record<string, never>
>({
  name: 'workforce-membership',
  states: workforceMembershipStates,
  initial: 'active',
  terminal: ['ended'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'active', on: 'suspend', to: 'suspended' },
    { from: 'suspended', on: 'reactivate', to: 'active' },
    { from: ['active', 'suspended'], on: 'end', to: 'ended' },
  ],
});

export const workforceMembershipGraph = membershipMachine.graph;

export type WorkforceMembershipDecision =
  | Readonly<{
      kind: 'allowed';
      from: WorkforceMembershipState;
      to: WorkforceMembershipState;
      event: WorkforceMembershipEvent;
    }>
  | Readonly<{
      kind: 'denied';
      from: WorkforceMembershipState;
      event: WorkforceMembershipEvent;
      allowedEvents: readonly WorkforceMembershipEvent[];
    }>;

export const decideWorkforceMembership = (
  current: WorkforceMembershipState,
  event: WorkforceMembershipEvent,
): WorkforceMembershipDecision => {
  const transition = membershipMachine.transition(
    { state: current },
    { type: event },
    {},
  );

  if (transition.tag === 'err')
    return {
      kind: 'denied',
      from: current,
      event,
      allowedEvents: membershipMachine.allowedEvents(current),
    };

  return {
    kind: 'allowed',
    from: transition.value.from,
    to: transition.value.to,
    event: transition.value.event.type,
  };
};

export const allowedWorkforceMembershipEvents = (
  state: WorkforceMembershipState,
): readonly WorkforceMembershipEvent[] =>
  membershipMachine.allowedEvents(state);
