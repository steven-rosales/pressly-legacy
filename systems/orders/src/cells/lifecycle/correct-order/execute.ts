import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CorrectOrderCommand,
  CorrectOrderExpectedFailure,
} from './types.ts';

export type CorrectOrderWriter = (
  command: CorrectOrderCommand,
) => Promise<CellOutcome<OrderMutationResult, CorrectOrderExpectedFailure>>;

export const makeExecuteCorrectOrder =
  (dependencies: { writer: CorrectOrderWriter }): CorrectOrderWriter =>
  async (command) => {
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_correction_failed',
          message: 'The order could not be corrected.',
          safeMessage: 'The order could not be corrected.',
          status: 503,
          cause,
        }),
      );
    }
  };
