import { isCommandContextValid } from '@pressly/kernel';
import type { IncomingOrderProposalDecisionCommand } from './incoming-order-proposal.model.ts';

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
