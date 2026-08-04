import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../../../foundations/language/command-execution/order-command-idempotency.policy.ts';
import type { Clock } from '@pressly/time';
import { decideIncomingOrderProposal } from '../../../foundations/language/incoming-order-proposal/incoming-order-proposal.lifecycle.ts';
import { orderInvariantError } from '../../../foundations/language/order/order-invariant.error.ts';
import type { CloseIncomingOrderSource } from './close-incoming-order-source.port.ts';
import type { CloseIncomingOrderSourceRepository } from './close-incoming-order-source.port.ts';
import { closeIncomingOrderSourceFailure } from './close-incoming-order-source.failure.ts';

const commandValid = (
  command: Parameters<CloseIncomingOrderSource>[0],
): boolean =>
  command.source.trim() !== '' &&
  command.externalOrderId.trim() !== '' &&
  (command.terminalCode === 'completed' ||
    command.terminalCode === 'canceled') &&
  isCommandContextValid(command.context) &&
  command.revision.adapterVersion.trim() !== '' &&
  /^[a-f0-9]{64}$/.test(command.revision.hash) &&
  Number.isFinite(command.revision.at.getTime()) &&
  Number.isFinite(command.revision.observedAt.getTime()) &&
  isJsonObject(command.revision.normalizedPayload);

export const makeCloseIncomingOrderSource = (deps: {
  repo: CloseIncomingOrderSourceRepository;
  clock: Clock;
}): CloseIncomingOrderSource => {
  return async (command) => {
    if (!commandValid(command))
      return result.err(closeIncomingOrderSourceFailure.invalid());

    try {
      const commandHash = hashOrderCommand(command);
      const idempotencyKey = [
        'incoming-order-source-close',
        command.source,
        command.externalOrderId,
        command.revision.hash,
      ].join(':');
      const closedAt = deps.clock.now();
      const value = await deps.repo.transaction(async (operations) => {
        await operations.lockSource(command.source, command.externalOrderId);
        const discovered = await operations.findProposal(
          command.source,
          command.externalOrderId,
        );
        if (discovered !== null) await operations.lockProposal(discovered.id);

        const proposal = await operations.findProposal(
          command.source,
          command.externalOrderId,
        );
        const existingTombstone = await operations.findTombstone(
          command.source,
          command.externalOrderId,
        );
        const tombstone =
          existingTombstone ??
          (await operations.createTombstone(command, proposal?.id ?? null));
        const canonical = await operations.findExactOrder(
          command.source,
          command.externalOrderId,
        );

        if (canonical !== null)
          return {
            outcome: 'existing_order' as const,
            proposalId: proposal?.id ?? tombstone.proposalId,
            version: proposal?.version ?? null,
            canonical:
              canonical.fulfillment === null
                ? null
                : {
                    orderId: canonical.orderId,
                    ...canonical.fulfillment,
                  },
            replayed: existingTombstone !== null,
          };

        if (proposal === null)
          return {
            outcome: 'tombstoned' as const,
            proposalId: null,
            version: null,
            canonical: null,
            replayed: existingTombstone !== null,
          };

        if (proposal.state === 'source_closed')
          return {
            outcome: 'already_source_closed' as const,
            proposalId: proposal.id,
            version: proposal.version,
            canonical: null,
            replayed: true,
          };

        if (proposal.state !== 'pending')
          return {
            outcome: 'already_decided' as const,
            proposalId: proposal.id,
            version: proposal.version,
            canonical: null,
            replayed: true,
          };

        const decision = decideIncomingOrderProposal(
          proposal.state,
          'source_close',
        );
        if (
          decision.kind === 'denied' ||
          decision.from !== 'pending' ||
          decision.to !== 'source_closed'
        )
          throw orderInvariantError(
            'INCOMING_ORDER_SOURCE_CLOSE_GRAPH_STATE_INVALID',
            'Incoming candidate graph denied a valid source-close transition.',
          );

        return operations.closeProposal({
          proposal,
          command,
          idempotencyKey,
          commandHash,
          closedAt,
          transition: {
            from: 'pending',
            to: 'source_closed',
            event: 'source_close',
            version: proposal.version + 1,
          },
        });
      });

      return result.ok(value);
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_source_close_failed',
          message: 'The source-terminal observation could not be recorded.',
          safeMessage: 'The source-terminal observation could not be recorded.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
import { isJsonObject } from '@pressly/codec';
