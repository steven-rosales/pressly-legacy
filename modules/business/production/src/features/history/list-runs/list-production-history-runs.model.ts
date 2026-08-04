import type {
  ProductionHistoryPage,
  ProductionHistoryRunStatus,
  ProductionHistoryRunSummary,
} from '../../../foundations/language/history/production-history.model.ts';

export type ListProductionHistoryRunsCommand = Readonly<{
  locationId: string;
  cursor?: string;
  limit: number;
  search?: string;
  status?: ProductionHistoryRunStatus;
  createdAfter?: Date;
}>;

export type ProductionHistoryRunsPage =
  ProductionHistoryPage<ProductionHistoryRunSummary>;
