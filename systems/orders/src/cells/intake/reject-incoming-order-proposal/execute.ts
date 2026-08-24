import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type {
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalExpectedFailure,
} from './types.ts';

export type RejectIncomingOrderProposalWriter = (
  command: RejectIncomingOrderProposalCommand,
) => Promise<
  CellOutcome<
    IncomingOrderProposalDecisionResult,
    RejectIncomingOrderProposalExpectedFailure
  >
>;

export const makeExecuteRejectIncomingOrderProposal =
  (dependencies: {
    writer: RejectIncomingOrderProposalWriter;
  }): RejectIncomingOrderProposalWriter =>
  async (command) => {
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_reject_failed',
          message: 'The incoming Order proposal could not be rejected.',
          safeMessage: 'The incoming Order proposal could not be rejected.',
          status: 503,
          cause,
        }),
      );
    }
  };
