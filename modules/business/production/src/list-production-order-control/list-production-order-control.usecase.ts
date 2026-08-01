import { result } from '@pressly/kernel';
import { productionError } from '../failure-mapping/production.error.ts';
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
    const found = await deps.repo.list(command, deps.clock.now());
    if (found.tag === 'location_not_found')
      return result.err(
        productionError(
          'PRODUCTION_LOCATION_NOT_FOUND',
          'The production location was not found.',
          404,
        ),
      );
    if (found.tag === 'invalid_cursor')
      return result.err(
        productionError(
          'PRODUCTION_ORDER_CURSOR_INVALID',
          'The production-order cursor is invalid.',
          400,
        ),
      );
    return result.ok(found.value);
  };

export type ListProductionOrderControlApplication = ReturnType<
  typeof makeListProductionOrderControl
>;
