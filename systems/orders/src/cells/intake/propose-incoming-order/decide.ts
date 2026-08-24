import { isJsonObject } from '@pressly/codec';
import { isCommandContextValid } from '@pressly/cells/command-context';
import { isOrderInputValid } from '../../../model/order-input.ts';
import type {
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderExpectedFailure,
} from './types.ts';

const invalid = (): ProposeIncomingOrderExpectedFailure => ({
  kind: 'validation',
  code: 'incoming_order_proposal_invalid',
  message:
    'The incoming Order candidate is incomplete or is not an exact submitted Order.',
});

export const validateProposeIncomingOrder = (
  command: ProposeIncomingOrderCommand,
): ProposeIncomingOrderExpectedFailure | null => {
  const customer = command.snapshot.customer;
  return command.source.trim() !== '' &&
    command.externalOrderId.trim() !== '' &&
    isCommandContextValid(command.context) &&
    command.proposalKind === 'submitted_order' &&
    command.revision.adapterVersion.trim() !== '' &&
    /^[a-f0-9]{64}$/.test(command.revision.hash) &&
    Number.isFinite(command.revision.at.getTime()) &&
    Number.isFinite(command.revision.observedAt.getTime()) &&
    isJsonObject(command.revision.normalizedPayload) &&
    (customer === null || customer.externalUserId.trim() !== '') &&
    (customer === null || isJsonObject(customer.normalizedPayload)) &&
    isOrderInputValid({
      displayNumber: command.snapshot.displayNumber,
      state: 'open',
      dueAt: command.snapshot.dueAt,
      currency: command.snapshot.currency,
      totalAmountCents: command.snapshot.totalAmountCents,
      balanceDueCents: command.snapshot.balanceDueCents,
      items: command.snapshot.items,
      fulfillment: {
        ...command.snapshot.fulfillment,
        releaseState: 'unreleased',
      },
    })
    ? null
    : invalid();
};
