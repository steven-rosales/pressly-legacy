import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import { validateCompleteOrder } from './decide.ts';
import type {
  CompleteOrderCommand,
  CompleteOrderExpectedFailure,
} from './types.ts';

export type CompleteOrderWriter = (
  command: CompleteOrderCommand,
) => Promise<CellOutcome<OrderMutationResult, CompleteOrderExpectedFailure>>;

export const makeExecuteCompleteOrder =
  (dependencies: { writer: CompleteOrderWriter }): CompleteOrderWriter =>
  async (command) => {
    const expectedFailure = validateCompleteOrder(command);
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
