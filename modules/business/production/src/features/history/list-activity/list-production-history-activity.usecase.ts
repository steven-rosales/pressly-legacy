import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import {
  productionHistoryCursorInvalid,
  productionHistoryLocationNotFound,
} from '../../../foundations/language/history/production-history.failure.ts';
import type {
  ListProductionHistoryActivity,
  ListProductionHistoryActivityRepository,
} from './list-production-history-activity.port.ts';

export const makeListProductionHistoryActivity =
  (deps: {
    repo: ListProductionHistoryActivityRepository;
    clock: Clock;
  }): ListProductionHistoryActivity =>
  async (command) => {
    const loaded = await withProductionDatabaseError(
      'PRODUCTION_HISTORY_ACTIVITY_LIST_FAILED',
      'Production activity history could not be loaded.',
      () => deps.repo.list(command, deps.clock.now()),
    );
    if (loaded.tag === 'location_not_found')
      return result.err(productionHistoryLocationNotFound());
    if (loaded.tag === 'invalid_cursor')
      return result.err(productionHistoryCursorInvalid());
    return result.ok(loaded.value);
  };
