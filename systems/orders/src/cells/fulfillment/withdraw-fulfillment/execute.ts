import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { validateWithdrawFulfillment } from './decide.ts';
import type {
  WithdrawFulfillmentCommand,
  WithdrawFulfillmentExpectedFailure,
} from './types.ts';

export type WithdrawFulfillmentWriter = (
  command: WithdrawFulfillmentCommand,
) => Promise<
  CellOutcome<OrderMutationResult, WithdrawFulfillmentExpectedFailure>
>;

export const makeExecuteWithdrawFulfillment =
  (dependencies: {
    writer: WithdrawFulfillmentWriter;
  }): WithdrawFulfillmentWriter =>
  async (command) => {
    const expectedFailure = validateWithdrawFulfillment(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'fulfillment_release_command_failed',
          message: 'The fulfillment release command could not be completed.',
          safeMessage:
            'The fulfillment release command could not be completed.',
          status: 503,
          cause,
        }),
      );
    }
  };
