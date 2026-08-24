import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { validateCancelOrder } from './decide.ts';
import type {
  CancelOrderCommand,
  CancelOrderExpectedFailure,
} from './types.ts';

export type CancelOrderWriter = (
  command: CancelOrderCommand,
) => Promise<CellOutcome<OrderMutationResult, CancelOrderExpectedFailure>>;

export const makeExecuteCancelOrder =
  (dependencies: { writer: CancelOrderWriter }): CancelOrderWriter =>
  async (command) => {
    const expectedFailure = validateCancelOrder(command);
    if (expectedFailure !== null)
      return { kind: 'failure', failure: expectedFailure };
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_lifecycle_command_failed',
          message: 'The order lifecycle command could not be completed.',
          safeMessage: 'The order lifecycle command could not be completed.',
          status: 503,
          cause,
        }),
      );
    }
  };
