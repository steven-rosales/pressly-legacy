import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  RestoreIncomingOrderProposalCommand,
  RestoreIncomingOrderProposalExpectedFailure,
  RestoreIncomingOrderProposalResult,
} from './types.ts';

export type RestoreIncomingOrderProposalWriter = (
  command: RestoreIncomingOrderProposalCommand,
) => Promise<
  CellOutcome<
    RestoreIncomingOrderProposalResult,
    RestoreIncomingOrderProposalExpectedFailure
  >
>;

export const makeExecuteRestoreIncomingOrderProposal =
  (dependencies: {
    writer: RestoreIncomingOrderProposalWriter;
  }): RestoreIncomingOrderProposalWriter =>
  async (command) => {
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'incoming_order_proposal_restore_failed',
          message: 'The incoming Order proposal could not be restored.',
          safeMessage: 'The incoming Order proposal could not be restored.',
          status: 503,
          cause,
        }),
      );
    }
  };
