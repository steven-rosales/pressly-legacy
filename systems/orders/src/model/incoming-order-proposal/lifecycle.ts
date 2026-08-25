import { isCommandContextValid } from '@pressly/cells/command-context';
import * as stateMachine from '@pressly/cells/state-machine';
import type {
  IncomingOrderProposalDecisionCommand,
  IncomingOrderProposalEvent,
  IncomingOrderProposalState,
} from './model.ts';

export const incomingOrderProposalDecisionCommandValid = (
  command: IncomingOrderProposalDecisionCommand<string>,
): boolean =>
  command.proposalId.trim() !== '' &&
  command.locationId.trim() !== '' &&
  Number.isInteger(command.expectedVersion) &&
  command.expectedVersion > 0 &&
  command.idempotencyKey.trim() !== '' &&
  isCommandContextValid(command.context) &&
  (command.reasonNote === null || command.reasonNote.trim() !== '');

type ProposalEntity = Readonly<{ state: string }>;
type ProposalEvent = Readonly<{ type: IncomingOrderProposalEvent }>;

const proposalMachine = stateMachine.define<
  readonly [
    'pending',
    'source_closed',
    'restored_pending',
    'accepted',
    'rejected',
  ],
  ProposalEvent,
  ProposalEntity,
  Record<string, never>
>({
  name: 'incoming-order-proposal',
  states: [
    'pending',
    'source_closed',
    'restored_pending',
    'accepted',
    'rejected',
  ],
  initial: 'pending',
  terminal: ['accepted', 'rejected'],
  getState: (entity) => entity.state,
  setState: (entity, state) => ({ ...entity, state }),
  transitions: [
    { from: 'pending', on: 'accept', to: 'accepted' },
    { from: 'pending', on: 'reject', to: 'rejected' },
    { from: 'pending', on: 'source_close', to: 'source_closed' },
    { from: 'source_closed', on: 'restore', to: 'restored_pending' },
    { from: 'restored_pending', on: 'accept', to: 'accepted' },
    { from: 'restored_pending', on: 'reject', to: 'rejected' },
  ],
});

export const incomingOrderProposalGraph = proposalMachine.graph;

export type IncomingOrderProposalDecision =
  | Readonly<{
      kind: 'allowed';
      from: IncomingOrderProposalState;
      to: IncomingOrderProposalState;
      event: IncomingOrderProposalEvent;
    }>
  | Readonly<{
      kind: 'denied';
      from: IncomingOrderProposalState;
      event: IncomingOrderProposalEvent;
      allowedEvents: readonly IncomingOrderProposalEvent[];
    }>;

export const decideIncomingOrderProposal = (
  current: IncomingOrderProposalState,
  event: IncomingOrderProposalEvent,
): IncomingOrderProposalDecision => {
  const transition = proposalMachine.transition(
    { state: current },
    { type: event },
    {},
  );
  if (transition.tag === 'err')
    return {
      kind: 'denied',
      from: current,
      event,
      allowedEvents: proposalMachine.allowedEvents(current),
    };
  return {
    kind: 'allowed',
    from: transition.value.from,
    to: transition.value.to,
    event: transition.value.event.type,
  };
};
