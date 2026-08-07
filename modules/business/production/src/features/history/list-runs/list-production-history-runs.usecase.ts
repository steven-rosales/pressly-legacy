import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import {
  productionHistoryCursorInvalid,
  productionHistoryLocationNotFound,
} from '../../../foundations/language/history/production-history.failure.ts';
import type {
  ListProductionHistoryRuns,
  ListProductionHistoryRunsRepository,
} from './list-production-history-runs.port.ts';

export const makeListProductionHistoryRuns =
  (deps: {
    repo: ListProductionHistoryRunsRepository;
    clock: Clock;
  }): ListProductionHistoryRuns =>
  async (command) => {
    const loaded = await withProductionDatabaseError(
      'PRODUCTION_HISTORY_RUNS_LIST_FAILED',
      'Production run history could not be loaded.',
      () => deps.repo.list(command, deps.clock.now()),
    );
    if (loaded.tag === 'location_not_found')
      return result.err(productionHistoryLocationNotFound());
    if (loaded.tag === 'invalid_cursor')
      return result.err(productionHistoryCursorInvalid());
    return result.ok(loaded.value);
  };
