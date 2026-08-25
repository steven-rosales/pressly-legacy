import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { validateProposeIncomingOrder } from './decide.ts';
import type {
  ProposeIncomingOrderCommand,
  ProposeIncomingOrderExpectedFailure,
  ProposeIncomingOrderRepository,
  ProposeIncomingOrderResult,
} from './types.ts';

export type ProposeIncomingOrderDependencies = Readonly<{
  repo: ProposeIncomingOrderRepository;
}>;

export type ExecuteProposeIncomingOrder = (
  command: ProposeIncomingOrderCommand,
) => Promise<
  CellOutcome<ProposeIncomingOrderResult, ProposeIncomingOrderExpectedFailure>
>;

export const makeExecuteProposeIncomingOrder =
  (
    dependencies: ProposeIncomingOrderDependencies,
  ): ExecuteProposeIncomingOrder =>
  async (command) => {
    const expectedFailure = validateProposeIncomingOrder(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const value = await dependencies.repo.transaction(async (repository) => {
        await repository.lockSource(command.source, command.externalOrderId);

        const canonical = await repository.findExactOrder(
          command.source,
          command.externalOrderId,
        );
        if (canonical !== null)
          return {
            proposalId: null,
            version: null,
            replayed: true,
            outcome: 'existing_order' as const,
          };

        const tombstone = await repository.findTombstone(
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

        const existing = await repository.findProposal(
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

        const created = await repository.createProposal(command);
        return {
          proposalId: created.proposalId,
          version: 1,
          replayed: false,
          outcome: 'proposed' as const,
        };
      });

      return { kind: 'success', value };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_failed',
          message: 'The incoming Order proposal could not be stored.',
          safeMessage: 'The incoming Order proposal could not be stored.',
          status: 503,
          cause,
        }),
      );
    }
  };
