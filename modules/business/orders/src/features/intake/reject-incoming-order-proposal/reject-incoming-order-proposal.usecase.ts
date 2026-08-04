import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { decideIncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
import { incomingOrderProposalDecisionCommandValid } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.policy.ts';
import { projectIncomingOrderProposalResolutionReplay } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal-resolution.projection.ts';
import { isRejectIncomingOrderProposalReasonCode } from './reject-incoming-order-proposal.policy.ts';
import type {
  RejectIncomingOrderProposal,
  RejectIncomingOrderProposalRepository,
} from './reject-incoming-order-proposal.port.ts';
import { rejectIncomingOrderProposalFailure } from './reject-incoming-order-proposal.failure.ts';

export const makeRejectIncomingOrderProposal = (deps: {
  repo: RejectIncomingOrderProposalRepository;
  clock: Clock;
}): RejectIncomingOrderProposal => {
  return async (command) => {
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      !isRejectIncomingOrderProposalReasonCode(command.reasonCode)
    )
      return result.err(rejectIncomingOrderProposalFailure.invalid());

    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
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
        if (receipt !== null) return receipt;

        const canonicalReceipt =
          await operations.loadCanonicalOrderCommandReceipt(
            command.idempotencyKey,
          );
        if (canonicalReceipt !== null) return { kind: 'conflict' as const };

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
          return { kind: 'not_found' as const };

        const proposalDecision = decideIncomingOrderProposal(
          proposal.state,
          'reject',
        );
        if (proposalDecision.kind === 'denied')
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };

        await operations.rejectProposal({
          proposal,
          idempotencyKey: command.idempotencyKey,
          commandHash,
          context: command.context,
          reasonCode: command.reasonCode,
          reasonNote: command.reasonNote,
          decidedAt: now,
          transition: {
            from: proposalDecision.from as 'pending' | 'restored_pending',
            to: 'rejected',
            event: 'reject',
            version: proposal.version + 1,
          },
        });

        return {
          kind: 'ok' as const,
          value: {
            proposalId: proposal.id,
            state: 'rejected' as const,
            version: proposal.version + 1,
            orderId: null,
            fulfillmentId: null,
            replayed: false,
          },
        };
      });

      if (outcome.kind === 'ok' || outcome.kind === 'replay')
        return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(rejectIncomingOrderProposalFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(rejectIncomingOrderProposalFailure.versionConflict());
      if (outcome.kind === 'invalid_transition')
        return result.err(
          rejectIncomingOrderProposalFailure.invalidTransition(),
        );

      return result.err(
        rejectIncomingOrderProposalFailure.idempotencyConflict(),
      );
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_proposal_reject_failed',
          message: 'The incoming Order proposal could not be rejected.',
          safeMessage: 'The incoming Order proposal could not be rejected.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
