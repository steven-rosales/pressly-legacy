import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalExpectedFailure,
} from './types.ts';

export type AcceptIncomingOrderProposalWriter = (
  command: AcceptIncomingOrderProposalCommand,
) => Promise<
  CellOutcome<
    IncomingOrderProposalDecisionResult,
    AcceptIncomingOrderProposalExpectedFailure
  >
>;

export const makeExecuteAcceptIncomingOrderProposal =
  (dependencies: {
    writer: AcceptIncomingOrderProposalWriter;
  }): AcceptIncomingOrderProposalWriter =>
  async (command) => {
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_accept_failed',
          message: 'The incoming Order proposal could not be accepted.',
          safeMessage: 'The incoming Order proposal could not be accepted.',
          status: 503,
          cause,
        }),
      );
    }
  };
