import type { ListProductionHistoryPlansFailure } from './list-production-history-plans.failure.ts';
import type { Result } from '@pressly/kernel';
import type { ProductionHistoryPageReadResult } from '../../../foundations/language/history/production-history.model.ts';
import type {
  ListProductionHistoryPlansCommand,
  ProductionHistoryPlansPage,
} from './list-production-history-plans.model.ts';

export type ListProductionHistoryPlans = (
  command: ListProductionHistoryPlansCommand,
) => Promise<
  Result<ProductionHistoryPlansPage, ListProductionHistoryPlansFailure>
>;

export type ListProductionHistoryPlansRepository = Readonly<{
  list: (
    command: ListProductionHistoryPlansCommand,
    now: Date,
  ) => Promise<ProductionHistoryPageReadResult<ProductionHistoryPlansPage>>;
}>;
