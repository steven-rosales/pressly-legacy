import type { ListProductionHistoryActivityFailure } from './list-production-history-activity.failure.ts';
import type { Result } from '@pressly/kernel';
import type { ProductionHistoryPageReadResult } from '../../../foundations/language/history/production-history.model.ts';
import type {
  ListProductionHistoryActivityCommand,
  ProductionHistoryActivityPage,
} from './list-production-history-activity.model.ts';

export type ListProductionHistoryActivity = (
  command: ListProductionHistoryActivityCommand,
) => Promise<
  Result<ProductionHistoryActivityPage, ListProductionHistoryActivityFailure>
>;

export type ListProductionHistoryActivityRepository = Readonly<{
  list: (
    command: ListProductionHistoryActivityCommand,
    now: Date,
  ) => Promise<ProductionHistoryPageReadResult<ProductionHistoryActivityPage>>;
}>;
