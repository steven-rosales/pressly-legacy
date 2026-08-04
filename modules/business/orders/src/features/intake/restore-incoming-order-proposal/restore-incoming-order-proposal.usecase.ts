import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { decideIncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
import { incomingOrderProposalDecisionCommandValid } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.policy.ts';
import type {
  RestoreIncomingOrderProposal,
  RestoreIncomingOrderProposalRepository,
} from './restore-incoming-order-proposal.port.ts';
import { restoreIncomingOrderProposalFailure } from './restore-incoming-order-proposal.failure.ts';

export const makeRestoreIncomingOrderProposal = (deps: {
  repo: RestoreIncomingOrderProposalRepository;
  clock: Clock;
}): RestoreIncomingOrderProposal => {
  return async (command) => {
    if (
      !incomingOrderProposalDecisionCommandValid(command) ||
      command.reasonCode !== 'source_closure_overridden'
    )
      return result.err(restoreIncomingOrderProposalFailure.invalid());

    try {
      const commandHash = hashOrderCommand(command);
      const now = deps.clock.now();
      const outcome = await deps.repo.transaction(async (operations) => {
        await operations.lockCommand(command.idempotencyKey);
        const replay = await operations.loadTransitionByIdempotencyKey(
          command.idempotencyKey,
        );
        if (replay !== null)
          return replay.commandHash === commandHash &&
            replay.event === 'restore' &&
            replay.to === 'restored_pending'
            ? {
                kind: 'ok' as const,
                value: {
                  proposalId: replay.proposalId,
                  state: 'restored_pending' as const,
                  version: replay.proposalVersion,
                  replayed: true,
                },
              }
            : { kind: 'conflict' as const };

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

        const decision = decideIncomingOrderProposal(proposal.state, 'restore');
        if (
          decision.kind === 'denied' ||
          decision.from !== 'source_closed' ||
          decision.to !== 'restored_pending'
        )
          return { kind: 'invalid_transition' as const };
        if (proposal.version !== command.expectedVersion)
          return { kind: 'version_conflict' as const };

        return {
          kind: 'ok' as const,
          value: await operations.restoreProposal({
            proposal,
            idempotencyKey: command.idempotencyKey,
            commandHash,
            context: command.context,
            reasonCode: command.reasonCode,
            reasonNote: command.reasonNote,
            restoredAt: now,
            transition: {
              from: 'source_closed',
              to: 'restored_pending',
              event: 'restore',
              version: proposal.version + 1,
            },
          }),
        };
      });

      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(restoreIncomingOrderProposalFailure.notFound());
      if (outcome.kind === 'version_conflict')
        return result.err(
          restoreIncomingOrderProposalFailure.versionConflict(),
        );
      if (outcome.kind === 'invalid_transition')
        return result.err(
          restoreIncomingOrderProposalFailure.invalidTransition(),
        );

      return result.err(
        restoreIncomingOrderProposalFailure.idempotencyConflict(),
      );
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_proposal_restore_failed',
          message: 'The incoming Order proposal could not be restored.',
          safeMessage: 'The incoming Order proposal could not be restored.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
