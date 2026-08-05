import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import {
  productionHistoryLocationNotFound,
  productionHistoryRunNotFound,
} from '../../../foundations/language/history/production-history.failure.ts';
import type {
  LoadProductionHistoryRun,
  LoadProductionHistoryRunRepository,
} from './load-production-history-run.port.ts';

export const makeLoadProductionHistoryRun =
  (deps: {
    repo: LoadProductionHistoryRunRepository;
    clock: Clock;
  }): LoadProductionHistoryRun =>
  async (command) => {
    const loaded = await withProductionDatabaseError(
      'PRODUCTION_HISTORY_RUN_LOAD_FAILED',
      'The production run history could not be loaded.',
      () => deps.repo.load(command, deps.clock.now()),
    );
    if (loaded.tag === 'location_not_found')
      return result.err(productionHistoryLocationNotFound());
    if (loaded.tag === 'run_not_found')
      return result.err(productionHistoryRunNotFound());
    return result.ok(loaded.value);
  };
