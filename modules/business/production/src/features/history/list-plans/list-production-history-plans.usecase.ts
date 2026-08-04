import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import {
  productionHistoryCursorInvalid,
  productionHistoryLocationNotFound,
} from '../../../foundations/language/history/production-history.failure.ts';
import type {
  ListProductionHistoryPlans,
  ListProductionHistoryPlansRepository,
} from './list-production-history-plans.port.ts';

export const makeListProductionHistoryPlans =
  (deps: {
    repo: ListProductionHistoryPlansRepository;
    clock: Clock;
  }): ListProductionHistoryPlans =>
  async (command) => {
    const loaded = await withProductionDatabaseError(
      'PRODUCTION_HISTORY_PLANS_LIST_FAILED',
      'Production plan history could not be loaded.',
      () => deps.repo.list(command, deps.clock.now()),
    );
    if (loaded.tag === 'location_not_found')
      return result.err(productionHistoryLocationNotFound());
    if (loaded.tag === 'invalid_cursor')
      return result.err(productionHistoryCursorInvalid());
    return result.ok(loaded.value);
  };

export type {
  ListProductionHistoryPlans,
  ListProductionHistoryPlansRepository,
} from './list-production-history-plans.port.ts';
