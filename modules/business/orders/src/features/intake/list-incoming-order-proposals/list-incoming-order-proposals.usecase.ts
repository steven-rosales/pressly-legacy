import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { incomingOrderProposalQueryValid } from './list-incoming-order-proposals.policy.ts';
import type {
  ListIncomingOrderProposals,
  ListIncomingOrderProposalsRepository,
} from './list-incoming-order-proposals.port.ts';
import { listIncomingOrderProposalsFailure } from './list-incoming-order-proposals.failure.ts';

export const makeListIncomingOrderProposals = (
  repo: ListIncomingOrderProposalsRepository,
): ListIncomingOrderProposals => {
  return async (query) => {
    if (!incomingOrderProposalQueryValid(query))
      return result.err(listIncomingOrderProposalsFailure.invalidQuery());

    try {
      const loaded = await repo.list(query);
      if (loaded.kind === 'invalid_cursor')
        return result.err(listIncomingOrderProposalsFailure.invalidCursor());

      return result.ok(loaded.value);
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'incoming_order_proposal_query_failed',
          message: 'Incoming Order proposals could not be loaded.',
          safeMessage: 'Incoming Order proposals could not be loaded.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
};
