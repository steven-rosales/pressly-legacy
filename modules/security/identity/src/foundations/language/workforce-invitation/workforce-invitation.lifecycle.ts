import { stateMachine } from '@pressly/kernel';

export const workforceInvitationStates = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;

export type WorkforceInvitationState =
  (typeof workforceInvitationStates)[number];

export const workforceInvitationEvents = [
  'accept',
  'revoke',
  'expire',
] as const;

export type WorkforceInvitationEvent =
  (typeof workforceInvitationEvents)[number];

type InvitationEntity = Readonly<{ state: string }>;
type InvitationEvent = Readonly<{ type: WorkforceInvitationEvent }>;

const invitationMachine = stateMachine.define<
  typeof workforceInvitationStates,
  InvitationEvent,
  InvitationEntity,
  Record<string, never>
>({
  name: 'workforce-invitation',
  states: workforceInvitationStates,
  initial: 'pending',
  terminal: ['accepted', 'revoked', 'expired'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'pending', on: 'accept', to: 'accepted' },
    { from: 'pending', on: 'revoke', to: 'revoked' },
    { from: 'pending', on: 'expire', to: 'expired' },
  ],
});

export const workforceInvitationGraph = invitationMachine.graph;

export type WorkforceInvitationDecision =
  | Readonly<{
      kind: 'allowed';
      from: WorkforceInvitationState;
      to: WorkforceInvitationState;
      event: WorkforceInvitationEvent;
    }>
  | Readonly<{
      kind: 'denied';
      from: WorkforceInvitationState;
      event: WorkforceInvitationEvent;
      allowedEvents: readonly WorkforceInvitationEvent[];
    }>;

export const decideWorkforceInvitation = (
  current: WorkforceInvitationState,
  event: WorkforceInvitationEvent,
): WorkforceInvitationDecision => {
  const transition = invitationMachine.transition(
    { state: current },
    { type: event },
    {},
  );

  if (transition.tag === 'err')
    return {
      kind: 'denied',
      from: current,
      event,
      allowedEvents: invitationMachine.allowedEvents(current),
    };

  return {
    kind: 'allowed',
    from: transition.value.from,
    to: transition.value.to,
    event: transition.value.event.type,
  };
};

export const allowedWorkforceInvitationEvents = (
  state: WorkforceInvitationState,
): readonly WorkforceInvitationEvent[] =>
  invitationMachine.allowedEvents(state);
