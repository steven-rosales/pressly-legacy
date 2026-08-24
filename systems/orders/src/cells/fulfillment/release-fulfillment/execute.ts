import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { validateReleaseFulfillment } from './decide.ts';
import type {
  ReleaseFulfillmentCommand,
  ReleaseFulfillmentExpectedFailure,
} from './types.ts';

export type ReleaseFulfillmentWriter = (
  command: ReleaseFulfillmentCommand,
) => Promise<
  CellOutcome<OrderMutationResult, ReleaseFulfillmentExpectedFailure>
>;

export const makeExecuteReleaseFulfillment =
  (dependencies: {
    writer: ReleaseFulfillmentWriter;
  }): ReleaseFulfillmentWriter =>
  async (command) => {
    const expectedFailure = validateReleaseFulfillment(command);
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
