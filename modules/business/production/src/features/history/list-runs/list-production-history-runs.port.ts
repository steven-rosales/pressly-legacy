import type { ListProductionHistoryRunsFailure } from './list-production-history-runs.failure.ts';
import type { Result } from '@pressly/kernel';
import type { ProductionHistoryPageReadResult } from '../../../foundations/language/history/production-history.model.ts';
import type {
  ListProductionHistoryRunsCommand,
  ProductionHistoryRunsPage,
} from './list-production-history-runs.model.ts';

export type ListProductionHistoryRuns = (
  command: ListProductionHistoryRunsCommand,
) => Promise<
  Result<ProductionHistoryRunsPage, ListProductionHistoryRunsFailure>
>;

export type ListProductionHistoryRunsRepository = Readonly<{
  list: (
    command: ListProductionHistoryRunsCommand,
    now: Date,
  ) => Promise<ProductionHistoryPageReadResult<ProductionHistoryRunsPage>>;
}>;
