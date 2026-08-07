import {
  notFoundFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { result } from '@pressly/kernel';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type { Clock } from '@pressly/time';
import type {
  ListProductionOrders,
  ListProductionOrdersRepository,
} from './list-production-orders.port.ts';

export const makeListProductionOrders =
  (deps: {
    repo: ListProductionOrdersRepository;
    clock: Clock;
  }): ListProductionOrders =>
  async (command) => {
    const found = await withProductionDatabaseError(
      'PRODUCTION_ORDER_LIST_FAILED',
      'Production orders could not be loaded.',
      () => deps.repo.listOrders(command, deps.clock.now()),
    );
    if (found.tag === 'location_not_found')
      return result.err(
        notFoundFailure({
          code: 'production_location_not_found',
          message: 'The production location was not found.',
          safeMessage: 'The production location was not found.',
        }),
      );

    if (found.tag === 'invalid_cursor')
      return result.err(
        validationFailure({
          code: 'production_order_cursor_invalid',
          message: 'The production-order cursor is invalid.',
          safeMessage: 'The production-order cursor is invalid.',
        }),
      );

    return result.ok(found.value);
  };
