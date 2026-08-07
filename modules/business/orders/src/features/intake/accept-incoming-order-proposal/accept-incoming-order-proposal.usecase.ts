import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { decideIncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
import { incomingOrderProposalDecisionCommandValid } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.policy.ts';
import { projectIncomingOrderProposalResolutionReplay } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal-resolution.projection.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type {
  AcceptIncomingOrderProposal,
  AcceptIncomingOrderProposalRepository,
} from './accept-incoming-order-proposal.port.ts';
import { acceptIncomingOrderProposalFailure } from './accept-incoming-order-proposal.failure.ts';

export const makeAcceptIncomingOrderProposal = (deps: {
  repo: AcceptIncomingOrderProposalRepository;
  clock: Clock;
}): AcceptIncomingOrderProposal => {
  return async (command) => {
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      command.reasonCode !== 'incoming_order_accepted'
    )
      return result.err(acceptIncomingOrderProposalFailure.invalid());

    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      return await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const storedResolution =
          await operations.loadResolutionByIdempotencyKey(
            command.idempotencyKey,
          );
        const receipt = projectIncomingOrderProposalResolutionReplay(
          storedResolution?.proposalId ?? command.proposalId,
          storedResolution,
          commandHash,
        );
        if (receipt !== null)
          return receipt.kind === 'replay'
            ? result.ok(receipt.value)
            : result.err(
                acceptIncomingOrderProposalFailure.idempotencyConflict(),
              );

        const canonicalReceipt =
          await operations.loadCanonicalOrderCommandReceipt(
            command.idempotencyKey,
          );
        if (canonicalReceipt !== null) {
          if (canonicalReceipt.commandHash !== commandHash)
            return result.err(
              acceptIncomingOrderProposalFailure.idempotencyConflict(),
            );
          throw orderInvariantError(
            'INCOMING_ORDER_PROPOSAL_RESOLUTION_MISSING',
            'Canonical Order receipt exists without its proposal resolution.',
          );
        }

        const discovered = await operations.loadProposal(command.proposalId);
        if (discovered !== null) {
          await operations.lockSource(
            discovered.source,
            discovered.externalOrderId,
          );
          await operations.lockProposal(command.proposalId);
        }
        const proposal =
          discovered === null
            ? null
            : await operations.loadProposal(command.proposalId);
        if (proposal === null || proposal.locationId !== command.locationId)
          return result.err(acceptIncomingOrderProposalFailure.notFound());

        const proposalDecision = decideIncomingOrderProposal(
          proposal.state,
          'accept',
        );
        if (proposalDecision.kind === 'denied')
          return result.err(
            acceptIncomingOrderProposalFailure.invalidTransition(),
          );
        if (proposal.version !== command.expectedVersion)
          return result.err(
            acceptIncomingOrderProposalFailure.versionConflict(),
          );

        const linked = await operations.findExactOrder(
          proposal.source,
          proposal.externalOrderId,
        );
        if (linked !== null)
          return result.err(
            acceptIncomingOrderProposalFailure.identityConflict(),
          );

        const customer = await operations.resolveOrCreateExactCustomer(
          proposal,
          now,
          command.context,
        );
        if (result.isErr(customer))
          return result.err(
            acceptIncomingOrderProposalFailure.customerResolution(
              customer.error,
            ),
          );
        const created = await operations.acceptProposal({
          proposal,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
          customer: customer.value,
          canonical: { state: 'open', releaseState: 'unreleased' },
          transition: {
            from: proposalDecision.from as 'pending' | 'restored_pending',
            to: 'accepted',
            event: 'accept',
            version: proposal.version + 1,
          },
        });

        return result.ok({
          proposalId: proposal.id,
          state: 'accepted' as const,
          version: proposal.version + 1,
          orderId: created.orderId,
          fulfillmentId: created.fulfillmentId,
          replayed: false,
        });
      });
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_proposal_accept_failed',
          message: 'The incoming Order proposal could not be accepted.',
          safeMessage: 'The incoming Order proposal could not be accepted.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
