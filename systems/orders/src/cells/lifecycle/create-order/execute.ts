import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CreateOrderCommand,
  CreateOrderExpectedFailure,
} from './types.ts';

export type CreateOrderWriter = (
  command: CreateOrderCommand,
) => Promise<CellOutcome<OrderMutationResult, CreateOrderExpectedFailure>>;

export const makeExecuteCreateOrder =
  (dependencies: { writer: CreateOrderWriter }): CreateOrderWriter =>
  async (command) => {
    try {
      return await dependencies.writer(command);
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_create_failed',
          message: 'The order could not be created.',
          safeMessage: 'The order could not be created.',
          status: 503,
          cause,
        }),
      );
    }
  };
