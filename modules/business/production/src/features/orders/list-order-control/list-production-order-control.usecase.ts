import {
  notFoundFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { result } from '@pressly/kernel';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type { Clock } from '@pressly/time';
import type {
  ListProductionOrderControl,
  ListProductionOrderControlRepository,
} from './list-production-order-control.port.ts';

export const makeListProductionOrderControl =
  (deps: {
    repo: ListProductionOrderControlRepository;
    clock: Clock;
  }): ListProductionOrderControl =>
  async (command) => {
    const found = await withProductionDatabaseError(
      'PRODUCTION_ORDER_CONTROL_LIST_FAILED',
      'Production order control data could not be loaded.',
      () => deps.repo.list(command, deps.clock.now()),
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

export type ListProductionOrderControlApplication = ReturnType<
  typeof makeListProductionOrderControl
>;
