import { result } from '@pressly/kernel';
import { productionError } from '../failure-mapping/production.error.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type {
  ListProductionOrders,
  ListProductionOrdersRepository,
} from './list-production-orders.port.ts';

export const makeListProductionOrders =
  (deps: {
    repo: ListProductionOrdersRepository;
    clock: ClockPort;
  }): ListProductionOrders =>
  async (command) => {
    const found = await deps.repo.listOrders(command, deps.clock.now());

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

export type {
  ListProductionOrders,
  ListProductionOrdersCommand,
  ListProductionOrdersRepository,
  ListProductionOrdersRepositoryResult,
} from './list-production-orders.port.ts';
