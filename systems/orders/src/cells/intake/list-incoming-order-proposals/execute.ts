import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  decodeIncomingOrderProposalCursor,
  invalidIncomingOrderProposalCursor,
  validateListIncomingOrderProposals,
} from './decide.ts';
import type {
  IncomingOrderProposalListResult,
  ListIncomingOrderProposalsExpectedFailure,
  ListIncomingOrderProposalsQuery,
  ListIncomingOrderProposalsRepository,
} from './types.ts';

export const makeExecuteListIncomingOrderProposals =
  (repository: ListIncomingOrderProposalsRepository) =>
  async (
    query: ListIncomingOrderProposalsQuery,
  ): Promise<
    CellOutcome<
      IncomingOrderProposalListResult,
      ListIncomingOrderProposalsExpectedFailure
    >
  > => {
    const expectedFailure = validateListIncomingOrderProposals(query);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };

    try {
      const cursor =
        query.cursor === null
          ? null
          : decodeIncomingOrderProposalCursor(query.cursor);
      if (
        query.cursor !== null &&
        (cursor === null || cursor.view !== query.view)
      )
        return {
          kind: 'failure',
          failure: invalidIncomingOrderProposalCursor(),
        };
      return {
        kind: 'success',
        value: await repository.list({ query, cursor }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_query_failed',
          message: 'Incoming Order proposals could not be loaded.',
          safeMessage: 'Incoming Order proposals could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }
  };
