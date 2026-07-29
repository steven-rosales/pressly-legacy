import { isCommandContextValid, result } from '@pressly/kernel';
import { hashOrderCommand } from '../order-command-idempotency.policy.ts';
import { orderError } from '../order.error.ts';
import { decideIncomingOrderProposal } from '../incoming-order-proposal.policy.ts';
import type {
  CloseIncomingOrderSource,
  OrderClockPort,
} from '../orders.port.ts';
import type { CloseIncomingOrderSourceRepository } from './incoming-order-proposal.port.ts';

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
  command.revision.normalizedPayload !== null &&
  typeof command.revision.normalizedPayload === 'object' &&
  !Array.isArray(command.revision.normalizedPayload);

export const makeCloseIncomingOrderSource = (deps: {
  repo: CloseIncomingOrderSourceRepository;
  clock: OrderClockPort;
}): CloseIncomingOrderSource => {
  return async (command) => {
    if (!commandValid(command))
      return result.err(
        orderError(
          'INCOMING_ORDER_SOURCE_CLOSE_INVALID',
          'The incoming source-terminal observation is invalid.',
          400,
        ),
      );

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
        if (discovered !== null) {
          await operations.lockProposal(discovered.id);
        }
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
          throw new Error(
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
      return result.err(
        orderError(
          'INCOMING_ORDER_SOURCE_CLOSE_FAILED',
          'The source-terminal observation could not be recorded.',
          503,
          error,
        ),
      );
    }
  };
};
