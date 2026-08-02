import { notFoundError, validationError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  ListProductionOrderControl,
  ListProductionOrderControlRepository,
} from './list-production-order-control.port.ts';

export const makeListProductionOrderControl =
  (deps: {
    repo: ListProductionOrderControlRepository;
    clock: ClockPort;
  }): ListProductionOrderControl =>
  async (command) => {
    const loaded = await toProductionDatabaseResult(
      'PRODUCTION_ORDER_CONTROL_LIST_FAILED',
      'Production order control data could not be loaded.',
      () => deps.repo.list(command, deps.clock.now()),
    );
    if (result.isErr(loaded)) return loaded;
    const found = loaded.value;
    if (found.tag === 'location_not_found')
      return result.err(
        notFoundError({
          code: 'production_location_not_found',
          message: 'The production location was not found.',
          safeMessage: 'The production location was not found.',
        }),
      );
    if (found.tag === 'invalid_cursor')
      return result.err(
        validationError({
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
