import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import { isOrderInputValid } from '../../../foundations/language/order/order-input.policy.ts';
import type { ProposeIncomingOrder } from './propose-incoming-order.port.ts';
import type { ProposeIncomingOrderRepository } from './propose-incoming-order.port.ts';
import { proposeIncomingOrderFailure } from './propose-incoming-order.failure.ts';

const proposalInputValid = (
  command: Parameters<ProposeIncomingOrder>[0],
): boolean => {
  const customer = command.snapshot.customer;
  return (
    command.source.trim() !== '' &&
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
      customer: {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      },
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
        bagCount: null,
      },
    })
  );
};

export const makeProposeIncomingOrder = (
  repo: ProposeIncomingOrderRepository,
): ProposeIncomingOrder => {
  return async (command) => {
    if (!proposalInputValid(command))
      return result.err(proposeIncomingOrderFailure.invalid());

    try {
      const outcome = await repo.transaction(async (operations) => {
        await operations.lockSource(command.source, command.externalOrderId);
        const linked = await operations.findExactOrder(
          command.source,
          command.externalOrderId,
        );
        if (linked !== null)
          return {
            proposalId: null,
            version: null,
            replayed: true,
            outcome: 'existing_order' as const,
          };

        const tombstone = await operations.findTombstone(
          command.source,
          command.externalOrderId,
        );
        if (tombstone !== null)
          return {
            proposalId: tombstone.proposalId,
            version: null,
            replayed: true,
            outcome: 'source_closed' as const,
          };

        const existing = await operations.findProposal(
          command.source,
          command.externalOrderId,
        );
        if (existing !== null)
          return {
            proposalId: existing.id,
            version: existing.version,
            replayed: true,
            outcome: 'existing_proposal' as const,
          };

        const created = await operations.createProposal(command);
        return {
          proposalId: created.proposalId,
          version: 1,
          replayed: false,
          outcome: 'proposed' as const,
        };
      });

      return result.ok(outcome);
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_proposal_failed',
          message: 'The incoming Order proposal could not be stored.',
          safeMessage: 'The incoming Order proposal could not be stored.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
import { isJsonObject } from '@pressly/codec';
